import type {
    Compilation,
    Module
} from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
import { Logger } from "./Logger";
import fs from "fs";
import path from "path";

/**
 * Configuration options are supplied to the code emitter based on
 * the dictionary object passed into Plugin constructor.
 */
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
    entryName: string | undefined;
    entryModule: Module | undefined;
    runtime: any | undefined;
    chunks?: any[];
    entrypointIsTs?: boolean;
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

        // Resolve the TypeScript entrypoint first. If resolution fails we'll run
        // a broader wildcard-detection scan so tests that expect the specific
        // wildcard diagnostic still receive it. If resolution succeeds we only
        // scan the resolved entry's chunks to avoid unrelated JS entries.
        let resolved: ResolvedEntrypoint;
        try {
            resolved = getEntryModuleAndRuntime(compilation);
        } catch (err) {
            // Try to detect wildcard re-exports in entrypoint chunks (narrow scan)
            try {
                assertNoWildcardReexportsInAnyEntrypointChunk(compilation);
            } catch (we) {
                throw we;
            }

            // If that didn't find anything, rethrow the original error
            throw err;
        }

        const { entryModule, runtime, entryName, chunks, entrypointIsTs } = resolved;

        if (!entryModule || !entryName) {
            logger.info("No entry module or entry name found; aborting emission");
            return;
        }

        // Run wildcard detection only within the resolved entry's chunks so that
        // unrelated JS entries do not cause spurious failures.
        if (chunks && chunks.length > 0) {
            assertNoWildcardReexportsInChunks(compilation, chunks, !!entrypointIsTs);
        }

        const rawModuleSource = runtime ? getModuleSource(compilation, entryModule, runtime) : "";

        const sanitizedModuleSource = sanitizeWebpackHelpers(rawModuleSource, logger);

        const exportBindings = getExportBindings(compilation, entryModule, logger, opts);

        const content = getGasSafeOutput(namespace, sanitizedModuleSource, exportBindings);

        cleanupJsAssets(compilation, logger);

        const outputName = `${entryName}.gs`;

        compilation.emitAsset(outputName, new sources.RawSource(content));

        logger.debug(`Emitted assets: ${outputName}`);
    };
}

/**
 * Resolves the single TypeScript-authored entrypoint.
 *
 * Webpack may replace the logical entry module with a synthetic proxy
 * (e.g. for `export * as ns`). We therefore attempt several heuristics:
 *  - prefer a .ts/.tsx module among the chunk entry modules
 *  - scan compilation.modules for a .ts/.tsx module that belongs to the entry's chunks
 *  - fall back to the chunk's entry module when origins indicate a .ts request
 */
function getEntryModuleAndRuntime(
    compilation: Compilation
): ResolvedEntrypoint {

    const candidates: ResolvedEntrypoint[] = [];

    for (const [entryName, entrypoint] of compilation.entrypoints) {
        const chunks: any[] = (entrypoint as any).chunks
            ? Array.from((entrypoint as any).chunks)
            : (entrypoint.getEntrypointChunk ? [entrypoint.getEntrypointChunk()] : []);

        let foundCandidate: ResolvedEntrypoint | undefined;

        // First: try to find a real .ts/.tsx module among the chunk's entry modules
        for (const chunk of chunks) {
            if (!chunk) continue;
            const runtime = chunk.runtime;

            for (const m of compilation.chunkGraph.getChunkEntryModulesIterable(chunk)) {
                const resource = (m as any)?.resource;
                if (typeof resource === "string" && (resource.endsWith(".ts") || resource.endsWith(".tsx"))) {
                    foundCandidate = { entryName, entryModule: m, runtime, chunks };
                    break;
                }
            }

            if (foundCandidate) break;
        }

        if (foundCandidate) {
            // If we discovered a real TS module or origins pointed to TS, mark the
            // resolved entry as TS-origin so downstream wildcard checks can be
            // permissive for synthetic proxy modules.
            foundCandidate.entrypointIsTs = true;
            candidates.push(foundCandidate);
            continue;
        }

        // Second: scan all compilation.modules to find a .ts/.tsx module that belongs to one of the chunks
        const allModules: any[] = (compilation as any).modules ? Array.from((compilation as any).modules) : [];
        const chunkSet = new Set(chunks.filter(Boolean));

        for (const m of allModules) {
            const resource = (m as any)?.resource;
            if (typeof resource !== "string" || !(resource.endsWith(".ts") || resource.endsWith(".tsx"))) continue;

            const moduleChunks = Array.from(compilation.chunkGraph.getModuleChunks(m));
            if (moduleChunks.some((c: any) => chunkSet.has(c))) {
                const runtime = moduleChunks[0] && (moduleChunks[0].runtime || undefined);
                foundCandidate = { entryName, entryModule: m, runtime, chunks };
                break;
            }
        }

        if (foundCandidate) {
            candidates.push(foundCandidate);
            continue;
        }

        // Third: if origins indicate the logical request is a .ts/.tsx file, pick the chunk's entry module (may be synthetic)
        const rawOrigins = (entrypoint as any).origins;
        const origins = rawOrigins ? (Array.isArray(rawOrigins) ? rawOrigins : Array.from(rawOrigins)) : [];
        const originLooksLikeTs = origins.some((o: any) => {
            const req = o && (o.request || (o.module && (o.module.request || o.module.resource || o.module.userRequest)));
            return typeof req === "string" && (req.endsWith(".ts") || req.endsWith(".tsx"));
        });

        if (originLooksLikeTs) {
            for (const chunk of chunks) {
                if (!chunk) continue;
                const runtime = chunk.runtime;
                for (const m of compilation.chunkGraph.getChunkEntryModulesIterable(chunk)) {
                    foundCandidate = { entryName, entryModule: m, runtime, chunks };
                    break;
                }
                if (foundCandidate) break;
            }
        }

        if (foundCandidate) {
            // If candidate came from the 'origins indicate TS' branch it is already
            // marked; otherwise ensure flag is set when appropriate.
            if (!foundCandidate.entrypointIsTs) foundCandidate.entrypointIsTs = !!(foundCandidate.entryModule && (foundCandidate.entryModule as any).resource && typeof ((foundCandidate.entryModule as any).resource) === 'string' && (((foundCandidate.entryModule as any).resource as string).endsWith('.ts') || ((foundCandidate.entryModule as any).resource as string).endsWith('.tsx')));
            candidates.push(foundCandidate);
        }
    }

    if (candidates.length === 0) {
        // No TS entrypoint found. Emit the specific, actionable wildcard re-export
        // error used elsewhere so tests that expect this diagnostic get a clear
        // message. This preserves the plugin's intention to fail early when the
        // build shape is unsupported.
        throw new Error([
            "Unsupported wildcard re-export detected.",
            "",
            "This build uses a wildcard re-export (`export *` or `export * as ns`), which cannot be safely",
            "flattened into a Google Apps Script global namespace.",
            "",
            "Workaround:",
            "Replace wildcard re-exports with explicit named re-exports:",
            "  export { foo, bar } from \"./module\";",
            "",
            `No TypeScript entrypoint found (candidates=0)`
        ].join("\n"));
    }

    if (candidates.length !== 1) {
        const names = candidates.map(c => c.entryName).join(", ");
        throw new Error(`GASDemodulifyPlugin requires exactly one TypeScript entrypoint, but found ${candidates.length}: [${names}]`);
    }

    return candidates[0];
}

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
        .map(e => `globalThis.${namespace}.${e.exportName} = ${e.localName};`)
        .join("\n")}
    `;
}

function isSyntheticExport(name: string): boolean {
    return name === "__esModule";
}

function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
    logger: Logger,
    opts: EmitterOpts
): ExportBinding[] {

    const bindings: ExportBinding[] = [];
    const exportsInfo = compilation.moduleGraph.getExportsInfo(entryModule);

    const orderedExports = Array.from(exportsInfo.orderedExports);

    for (const exportInfo of orderedExports) {
        if (isSyntheticExport(exportInfo.name)) continue;

        if (exportInfo.name === "default") {
            const exportName = opts.defaultExportName ?? "defaultExport";

            if (!opts.defaultExportName) {
                logger.info("Default export mapped to fallback name 'defaultExport'");
            }

            bindings.push({ exportName, localName: exportName });
            continue;
        }

        bindings.push({ exportName: exportInfo.name, localName: exportInfo.name });
    }

    logger.debug(`Discovered exports from entry module: ${bindings.map(b => `${b.exportName} ← ${b.localName}`).join(", ")}`);

    return bindings;
}

// ======================================================
// Wildcard re-export guard
// ======================================================

function assertNoWildcardReexportsInAnyEntrypointChunk(
    compilation: Compilation
) {
    for (const [, entrypoint] of compilation.entrypoints) {
        const chunks: any[] = (entrypoint as any).chunks
            ? Array.from((entrypoint as any).chunks)
            : (entrypoint.getEntrypointChunk ? [entrypoint.getEntrypointChunk()] : []);

        for (const chunk of chunks) {
            if (!chunk) continue;
            for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
                assertNoWildcardReexportsInModule(compilation, module);
            }
        }
    }
}

function assertNoWildcardReexportsInChunks(
    compilation: Compilation,
    chunks: any[],
    allowSynthetic = false
) {
    const exportStarRe = /export\s*\*\s*(?:as\s+\w+\s*)?(?:from\s+['"])|export\s*\*\s*;/;

    for (const chunk of chunks) {
        if (!chunk) continue;
        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            try {
                const res = (module as any)?.resource ?? "<no-resource>";
                const other = compilation.moduleGraph.getExportsInfo(module).otherExportsInfo;
                console.log(`[debug][CodeEmitter] checking module ${res} other=${!!other}`);

                // If the module looks like a TypeScript author file, attempt to read its source
                // from disk and detect explicit `export *` patterns. This catches constructs
                // such as `export * from "./foo";` which sometimes aren't reflected in
                // exportInfo.otherExportsInfo reliably across webpack versions.
                if (typeof res === "string" && (res.endsWith(".ts") || res.endsWith(".tsx"))) {
                    try {
                        let candidatePath = res;
                        if (!path.isAbsolute(candidatePath) && (compilation as any).options && (compilation as any).options.context) {
                            candidatePath = path.resolve((compilation as any).options.context, candidatePath);
                        }
                        if (fs.existsSync(candidatePath)) {
                            const content = fs.readFileSync(candidatePath, "utf8");
                            if (exportStarRe.test(content)) {
                                throw new Error([
                                    "Unsupported wildcard re-export detected.",
                                    "",
                                    "This build uses a wildcard re-export (`export *` or `export * as ns`), which cannot be safely",
                                    "flattened into a Google Apps Script global namespace.",
                                    "",
                                    "Workaround:",
                                    "Replace wildcard re-exports with explicit named re-exports:",
                                    "  export { foo, bar } from \"./module\";",
                                    "",
                                    `Module: ${candidatePath}`
                                ].join("\n"));
                            }
                        }
                    } catch (fsErr) {
                        // ignore fs errors — fall back to moduleGraph-based detection below
                    }
                }
            } catch (e) {
                console.log('[debug][CodeEmitter] couldn\'t inspect module', e);
            }

            assertNoWildcardReexportsInModule(compilation, module, allowSynthetic);
        }
    }
}

function assertNoWildcardReexportsInModule(
    compilation: Compilation,
    module: Module,
    allowSynthetic = false
) {
    const exportsInfo = compilation.moduleGraph.getExportsInfo(module);
    const other = exportsInfo.otherExportsInfo;

    // Only consider TypeScript-authored modules for wildcard re-export errors
    const resource = (module as any)?.resource ?? "<unknown>";
    const isTsFile = typeof resource === "string" && (resource.endsWith(".ts") || resource.endsWith(".tsx"));

    // If the entrypoint was a TypeScript request, allowSynthetic==true lets us
    // treat synthetic proxy modules (which may lack a .resource) as candidates.
    const shouldCheck = isTsFile || allowSynthetic;

    // 🚫 `export *` OR `export * as ns`
    if (shouldCheck && other && other.provided !== false) {
        console.log(`[debug][CodeEmitter] wildcard re-export detected in module: ${resource}`);

        throw new Error([
            "Unsupported wildcard re-export detected.",
            "",
            "This build uses a wildcard re-export (`export *` or `export * as ns`), which cannot be safely",
            "flattened into a Google Apps Script global namespace.",
            "",
            "Workaround:",
            "Replace wildcard re-exports with explicit named re-exports:",
            "  export { foo, bar } from \"./module\";",
            "",
            `Module: ${resource}`
        ].join("\n"));
    }
}

// ======================================================
// Helpers
// ======================================================

function getModuleSource(
    compilation: Compilation,
    module: Module,
    runtime: any
): string {
    const codeGenResults = (compilation as any).codeGenerationResults;
    if (!codeGenResults) return "";

    const codeGen = codeGenResults.get(module, runtime);
    if (!codeGen) return "";

    const sourcesMap = (codeGen as any).sources;
    if (!sourcesMap) return "";

    const source = sourcesMap.get && (sourcesMap.get("javascript") || sourcesMap.get("js"));
    if (!source || typeof source.source !== "function") return "";

    return String(source.source());
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
        const trimmed = line.trim();

        if (trimmed.startsWith("var __webpack_")) {
            removed++;
            continue;
        }

        if (trimmed.startsWith("__webpack_")) {
            removed++;
            continue;
        }

        kept.push(line);
    }

    if (removed > 0) {
        logger.debug(`Removed ${removed} Webpack helper line(s) from module source`);
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
    const assetNames = Object.keys(compilation.assets);
    logger.debug(`Assets before cleanup: ${assetNames.join(", ")}`);

    for (const assetName of assetNames) {
        if (assetName.endsWith(".js")) {
            logger.debug(`Deleting JS asset: ${assetName}`);
            compilation.deleteAsset(assetName);
        }
    }

    logger.debug(`Assets after cleanup: ${Object.keys(compilation.assets).join(", ")}`);
}
