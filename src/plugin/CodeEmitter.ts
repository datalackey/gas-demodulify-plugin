// File: `src/plugin/CodeEmitter.ts`

import type { Compilation, Module } from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
import fs from "fs";
import path from "path";
import { Logger } from "./Logger";
import { FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS } from "./invariants";

/**
 * This module contains the code responsible for flattening a single Webpack
 * TypeScript entrypoint into a GAS-safe global namespace.
 *
 * Design invariants:
 *  - exactly one TS entrypoint
 *  - no wildcard re-exports
 *  - no retained Webpack runtime
 */

/**
 * Configuration options supplied to the code emitter.
 *
 * These options determine how symbols exported from the Webpack
 * entry module are attached to the global namespace in the emitted,
 * GAS-safe output.
 */
export type EmitterOpts = {
    /**
     * The root global namespace under which all emitted symbols are attached.
     *
     * Example:
     *   namespaceRoot: "MYADDON"
     *
     * Combined with `subsystem`, this forms the full namespace path:
     *   "MYADDON.GAS", "MYADDON.UI", "MYADDON.COMMON", etc.
     */
    namespaceRoot: string;

    /**
     * The logical subsystem being emitted.
     *
     * Typical values: "GAS", "UI", "COMMON".
     * Advanced users may supply dotted paths (e.g. "UI.Dialogs").
     */
    subsystem: string;

    /**
     * Optional override for how a default export is exposed on the namespace.
     *
     * If omitted, default exports are mapped to "defaultExport".
     */
    defaultExportName?: string;

    /**
     * Optional, explicit log level. Production code does not read process.env;
     * tests may supply this (test harness can read LOGLEVEL once and pass it).
     * Accepted values (case-insensitive): "debug", "info", or undefined.
     */
    logLevel?: string;
};

/**
 * Describes a single exported symbol binding.
 *
 * Each binding represents a concrete assignment of the form:
 *
 *   globalThis.<namespace>.<exportName> = <localName>;
 */
type ExportBinding = {
    /**
     * Name used on the global namespace.
     */
    exportName: string;

    /**
     * Local identifier defined in the transpiled module source.
     */
    localName: string;
};

/**
 * Describes the resolved TypeScript entrypoint selected for demodulification.
 *
 * This captures the minimal information needed to:
 *  - extract transpiled source
 *  - validate the dependency graph
 *  - derive the final output filename
 */
type ResolvedEntrypoint = {
    /**
     * Logical entry name as defined in webpack.config.js.
     */
    entryName: string;

    /**
     * Root Webpack module corresponding to the entrypoint source file. Modules map 1-1 with individual source files
     * and enable Webpack to represent dependency relationships via a graph of what modules
     */
    entryModule: Module;

    /**
     * Webpack runtime identifier associated with the entry chunk.
     */
    runtime: any;

    /**
     * All chunks reachable from this entrypoint. A chunk is a Webpack-internal unit of execution that
     * groups one or more modules together and defines how and where they run.
     *
     * Conceptually: Entrypoint -> Chunks (1 or more) -> Modules (many)
     */
    chunks: any[];
};

/**
 * Returns  a zero-argument function wired into Webpack’s processAssets hook that closes over:
 *  - the compilation
 *  - resolved plugin options
 *
 * This function is registered via:
 *
 *   compilation.hooks.processAssets.tap(...)
 *
 * @see https://webpack.js.org/api/compilation-hooks/#processassets
 *
 * Implements the complete demodulification pipeline:
 *  - resolve the single TS entrypoint
 *  - validate export invariants
 *  - extract transpiled source
 *  - remove Webpack helpers
 *  - emit GAS-safe output
 *  - delete all `.js` assets
 */
export function getEmitterFunc(
    compilation: Compilation,
    opts: EmitterOpts
) {
    return () => {
        Logger.debug("Entered processAssets hook");

        const namespace = `${opts.namespaceRoot}.${opts.subsystem}`;
        Logger.info(`Beginning demodulification for namespace '${namespace}'`);

        // Resolve the single TypeScript-authored entrypoint.
        const entry = resolveTsEntrypoint(compilation);
        Logger.info(`Resolved TypeScript entrypoint '${entry.entryName}'`);

        // Enforce export-surface determinism.
        assertNoWildcardReexports(compilation, entry);
        Logger.info("Validated export surface (no wildcard re-exports)");

        // Extract transpiled JavaScript source for the entry module.
        const rawSource = getModuleSource(
            compilation,
            entry.entryModule,
            entry.runtime
        );

        // Remove Webpack helper artifacts that GAS cannot execute.
        const sanitizedSource = sanitizeWebpackHelpers(rawSource);
        Logger.info("Sanitized transpiled module source");

        // Discover the explicit export surface of the entry module.
        const exportBindings = getExportBindings(
            compilation,
            entry.entryModule,
            opts
        );
        Logger.info(`Discovered ${exportBindings.length} exported symbol(s)`);

        // Assemble final GAS-safe output.
        const output = getGasSafeOutput(
            namespace,
            sanitizedSource,
            exportBindings
        );
        Logger.info("Assembled GAS-safe output");

        // Delete all `.js` artifacts emitted by Webpack.
        cleanupJsAssets(compilation);
        Logger.info("Removed transient Webpack JavaScript artifacts");

        // Output filename is derived from the Webpack entry name.
        const outputName = `${entry.entryName}.gs`;

        warnIfWebpackRuntimeLeaked(output, `${opts.namespaceRoot}.${opts.subsystem}`);
        compilation.emitAsset(outputName, new sources.RawSource(output));

        Logger.info(`Emitted GAS artifact '${outputName}'`);
    };
}

// ======================================================
// Entrypoint resolution (TS-only)
// ======================================================

/**
 * Resolves the single TypeScript-authored entrypoint.
 *
 * Invariants:
 *  - Exactly one `.ts` / `.tsx` entrypoint must exist
 *  - JavaScript-only entrypoints are ignored
 *
 * Violations fail fast to avoid ambiguous GAS output.
 *
 * What do we mean by  'runtime' ?
 *
 * The value of runtime is partially influenced by the target environment, but it is not
 * equal to the target and not determined by it alone. More accurately, runtime identifies
 * a Webpack bundle execution context (each with a distinct module registry, module cache, and execution order).
 * Such contexts may differ based on (a) target environment (such as a particular browser, Node variant, etc.),
 * (b) entrypoint, or both (a) and (b).
 *
 * Why do we need runtime in ResolvedEntrypoint?
 *
 * The runtime is needed to accurately retrieve the module source code
 * associated with the entry module. Webpack's code generation results
 * are keyed by both the module and its runtime (see usage of codeGenerationResults in
 * {@link getModuleSource})
 *
 * Why do we need chunks in ResolvedEntrypoint?
 *
 * Because the entry module alone is insufficient to validate the build.
 * Chunks give us access to the entire reachable module graph, which is required to:
 * <ul>
 *     <li>Detect unsupported wildcard re-exports</li>
 *     <li>Correctly associate the runtime</li>
 * </ul>
 */
function resolveTsEntrypoint(
    compilation: Compilation,
): ResolvedEntrypoint {
    Logger.debug("Resolving TypeScript entrypoint");

    const candidates: ResolvedEntrypoint[] = [];

    for (const [entryName, entrypoint] of compilation.entrypoints) {
        Logger.debug(`Inspecting entrypoint '${entryName}'`);

        /**
         * Webpack entrypoints do not expose a single, stable API for accessing
         * their associated chunks across versions.
         *
         * Depending on Webpack version and configuration:
         *  - `entrypoint.chunks` may exist (iterable)
         *  - `entrypoint.getEntrypointChunk()` may exist (singular)
         *
         * We normalize both cases into a concrete array below.
         */
        const chunks: any[] = Array.from(
            (entrypoint as any).chunks ??
            (entrypoint.getEntrypointChunk
                ? [entrypoint.getEntrypointChunk()]
                : [])
        );

        Logger.debug(`Entrypoint '${entryName}' has ${chunks.length} chunk(s)`);

        for (const chunk of chunks) {
            const runtime = chunk.runtime;

            for (const m of compilation.chunkGraph.getChunkEntryModulesIterable(chunk)) {
                /**
                 * We identify a TypeScript entrypoint by inspecting the *resource path*
                 * of the first module reachable from the entry chunk.
                 *
                 * Rationale:
                 *  - Webpack does not label "entry modules" explicitly
                 *  - The chunk graph may contain runtime and proxy modules
                 *  - The resource filename is the most stable discriminator
                 *
                 * Once a `.ts` / `.tsx` module is found, we treat it as authoritative
                 * for:
                 *  - export surface discovery
                 *  - code generation
                 *  - output filename derivation
                 *
                 * We intentionally break after the first match to avoid:
                 *  - duplicate candidate registration
                 *  - ambiguous multi-module entrypoints
                 */
                const res = (m as any)?.resource;
                if (typeof res === "string" && (res.endsWith(".ts") || res.endsWith(".tsx"))) {
                    Logger.debug(`Found TS entry module for '${entryName}': ${res}`);

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

    const resolved = candidates[0];
    Logger.debug(`Resolved entrypoint '${resolved.entryName}' with ${resolved.chunks.length} chunk(s)`);

    return resolved;
}

// ======================================================
// Wildcard re-export guard
// ======================================================

/**
 * Rejects wildcard re-exports anywhere in the entry’s dependency graph.
 *
 * Unsupported:
 *  - `export * from "./module"`
 *  - `export * as ns from "./module"`
 *
 * GAS requires a fully explicit, statically-known global surface.
 */
function assertNoWildcardReexports(
    compilation: Compilation,
    entry: ResolvedEntrypoint
) {
    // Match wildcard re-exports such as:
    //   export * from "./module";
    //   export * as ns from "./module";
    //   export *;
    const exportStarRe = /export\s*\*\s*(?:as\s+\w+\s*)?(?:from\s+['"]|;)/;

    for (const chunk of entry.chunks) {
        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            const resource = (module as any)?.resource;

            // Prefer source-level detection for TS-authored files.
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

            // Fallback: Webpack moduleGraph signal (synthetic proxy modules).
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

/**
 * Discovers the explicit export surface of the entry module.
 *
 * Notes:
 *  - Synthetic exports (e.g. "__esModule") are ignored
 *  - Default exports are mapped deterministically
 */
function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
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
                Logger.info(
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

/**
 * Retrieves Webpack’s generated JavaScript source for a module
 * without retaining the Webpack runtime wrapper.
 */
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

/**
 * Removes Webpack codegen helper artifacts from the module body.
 * Operates conservatively at the line level.
 */
function sanitizeWebpackHelpers(source: string): string {
    if (!source.trim()) return source;

    const lines = source.split(/\r?\n/);
    const out: string[] = [];
    let removed = 0;

    for (const line of lines) {
        const t = line.trim();

        if (t.startsWith("var __webpack_") || t.startsWith("__webpack_")) {
            removed++;
            // Preserve line count for source maps
            out.push("// [gas-demodulify] stripped webpack helper");
            //out.push(`// [gas-demodulify] stripped webpack helper: ${t}`);
        } else {
            out.push(line);
        }
    }

    if (removed > 0) {
        Logger.debug(`Stripped ${removed} Webpack helper line(s)`);
    }

    return out.join("\n");
}

/**
 * Non-fatal runtime invariant check: surface any leaked webpack runtime artifacts
 */
function warnIfWebpackRuntimeLeaked(output: string, context: string) {
    for (const forbidden of FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS) {
        if (output.includes(forbidden)) {
            Logger.error(
                `Internal invariant violated: Webpack runtime artifact '${forbidden}' ` +
                `detected in emitted GAS output (${context}). This indicates a demodulification bug.`
            );
            return;
        }
    }
}

/**
 * Emits a GAS-safe hierarchical namespace initializer.
 */
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

/**
 * Deletes all `.js` assets emitted by Webpack.
 *
 * In gas-demodulify builds, JavaScript output is transient and must not
 * be written to disk.
 */
function cleanupJsAssets(
    compilation: Compilation
) {
    for (const name of Object.keys(compilation.assets)) {
        if (name.endsWith(".js")) {
            compilation.deleteAsset(name);
        }
    }
}