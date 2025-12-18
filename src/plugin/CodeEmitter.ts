// File: `src/plugin/CodeEmitter.ts`
import type { Compilation, Module } from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
import fs from "fs";
import path from "path";
import { Logger } from "./Logger";

type EmitterOpts = {
    namespaceRoot: string;
    subsystem: string;
    defaultExportName?: string;
};

type ExportBinding = {
    exportName: string;
    localName: string;
};

type ResolvedEntrypoint = {
    entryName: string;
    entryModule: Module;
    runtime: any;
    chunks: any[];
};

export function getEmitterFunc(
    logger: Logger,
    compilation: Compilation,
    opts: EmitterOpts
) {
    return () => {
        logger.debug("Entered processAssets hook");

        const namespace = `${opts.namespaceRoot}.${opts.subsystem}`;
        logger.debug(`Computed namespace: ${namespace}`);

        const entry = resolveTsEntrypoint(compilation);

        assertNoWildcardReexports(compilation, entry);

        const rawSource = getModuleSource(
            compilation,
            entry.entryModule,
            entry.runtime
        );

        const sanitizedSource = sanitizeWebpackHelpers(rawSource, logger);

        const exportBindings = getExportBindings(
            compilation,
            entry.entryModule,
            logger,
            opts
        );

        const output = getGasSafeOutput(
            namespace,
            sanitizedSource,
            exportBindings
        );

        cleanupJsAssets(compilation, logger);

        const outputName = `${entry.entryName}.gs`;
        compilation.emitAsset(outputName, new sources.RawSource(output));

        logger.debug(`Emitted asset: ${outputName}`);
    };
}

// ======================================================
// Entrypoint resolution (TS-only)
// ======================================================

function resolveTsEntrypoint(
    compilation: Compilation
): ResolvedEntrypoint {
    const candidates: ResolvedEntrypoint[] = [];

    for (const [entryName, entrypoint] of compilation.entrypoints) {
        const chunks: any[] = Array.from(
            (entrypoint as any).chunks ??
            (entrypoint.getEntrypointChunk
                ? [entrypoint.getEntrypointChunk()]
                : [])
        );

        for (const chunk of chunks) {
            const runtime = chunk.runtime;
            for (const m of compilation.chunkGraph.getChunkEntryModulesIterable(chunk)) {
                const res = (m as any)?.resource;
                if (typeof res === "string" && (res.endsWith(".ts") || res.endsWith(".tsx"))) {
                    candidates.push({
                        entryName,
                        entryModule: m,
                        runtime,
                        chunks
                    });
                    break;
                }
            }
        }
    }

    if (candidates.length === 0) {
        throw unsupportedWildcardError(
            "No TypeScript entrypoint found"
        );
    }

    if (candidates.length > 1) {
        const names = candidates.map(c => c.entryName).join(", ");
        throw new Error(
            `GASDemodulifyPlugin requires exactly one TypeScript entrypoint, but found ${candidates.length}: [${names}]`
        );
    }

    return candidates[0];
}

// ======================================================
// Wildcard re-export guard
// ======================================================

function assertNoWildcardReexports(
    compilation: Compilation,
    entry: ResolvedEntrypoint
) {
    const exportStarRe =
        /export\s*\*\s*(?:as\s+\w+\s*)?(?:from\s+['"])|export\s*\*\s*;/;

    for (const chunk of entry.chunks) {
        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            const resource = (module as any)?.resource;

            // Prefer source-level detection for TS files
            if (typeof resource === "string" && (resource.endsWith(".ts") || resource.endsWith(".tsx"))) {
                const abs = path.isAbsolute(resource)
                    ? resource
                    : path.resolve(
                        (compilation as any).options?.context ?? process.cwd(),
                        resource
                    );

                if (fs.existsSync(abs)) {
                    const content = fs.readFileSync(abs, "utf8");
                    if (exportStarRe.test(content)) {
                        throw unsupportedWildcardError(`Module: ${abs}`);
                    }
                }
            }

            // Fallback: webpack moduleGraph signal (synthetic proxy modules)
            const exportsInfo =
                compilation.moduleGraph.getExportsInfo(module);
            const other = exportsInfo.otherExportsInfo;

            if (other && other.provided !== false) {
                throw unsupportedWildcardError(
                    `Module: ${resource ?? "<synthetic>"}`
                );
            }
        }
    }
}

function unsupportedWildcardError(details?: string): Error {
    return new Error(
        [
            "Unsupported wildcard re-export detected.",
            "",
            "This build uses a wildcard re-export (`export *` or `export * as ns`), which cannot be safely",
            "flattened into a Google Apps Script global namespace.",
            "",
            "Workaround:",
            "Replace wildcard re-exports with explicit named re-exports:",
            '  export { foo, bar } from "./module";',
            "",
            details ?? ""
        ].join("\n")
    );
}

// ======================================================
// Export surface
// ======================================================

function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
    logger: Logger,
    opts: EmitterOpts
): ExportBinding[] {
    const bindings: ExportBinding[] = [];
    const exportsInfo =
        compilation.moduleGraph.getExportsInfo(entryModule);

    for (const exportInfo of exportsInfo.orderedExports) {
        if (exportInfo.name === "__esModule") continue;

        if (exportInfo.name === "default") {
            const exportName =
                opts.defaultExportName ?? "defaultExport";

            if (!opts.defaultExportName) {
                logger.info(
                    "Default export mapped to fallback name 'defaultExport'"
                );
            }

            bindings.push({
                exportName,
                localName: exportName
            });
            continue;
        }

        bindings.push({
            exportName: exportInfo.name,
            localName: exportInfo.name
        });
    }

    return bindings;
}

// ======================================================
// Output helpers
// ======================================================

function getGasSafeOutput(
    namespace: string,
    moduleSource: string,
    exports: ExportBinding[]
) {
    return dedent`
        ${renderNamespaceInit(namespace)}

        // Module code (transpiled)
        ${moduleSource}

        // Export surface
        ${exports
        .map(
            e =>
                `globalThis.${namespace}.${e.exportName} = ${e.localName};`
        )
        .join("\n")}
    `;
}

function getModuleSource(
    compilation: Compilation,
    module: Module,
    runtime: any
): string {
    const results = (compilation as any).codeGenerationResults;
    if (!results) return "";

    const codeGen = results.get(module, runtime);
    if (!codeGen) return "";

    const sourcesMap = (codeGen as any).sources;
    const source =
        sourcesMap?.get("javascript") ?? sourcesMap?.get("js");

    return source?.source?.() ? String(source.source()) : "";
}

function sanitizeWebpackHelpers(
    source: string,
    logger: Logger
): string {
    if (!source.trim()) return source;

    const lines = source.split(/\r?\n/);
    const kept: string[] = [];
    let removed = 0;

    for (const line of lines) {
        const t = line.trim();
        if (t.startsWith("var __webpack_") || t.startsWith("__webpack_")) {
            removed++;
            continue;
        }
        kept.push(line);
    }

    if (removed > 0) {
        logger.debug(`Removed ${removed} Webpack helper line(s)`);
    }

    return kept.join("\n").trim();
}

function renderNamespaceInit(namespace: string): string {
    return dedent`
        // Namespace initialization
        (function init(ns) {
          let o = globalThis;
          for (const p of ns.split(".")) {
            o[p] = o[p] || {};
            o = o[p];
          }
        })("${namespace}");
    `;
}

function cleanupJsAssets(
    compilation: Compilation,
    logger: Logger
) {
    for (const name of Object.keys(compilation.assets)) {
        if (name.endsWith(".js")) {
            compilation.deleteAsset(name);
        }
    }
}
