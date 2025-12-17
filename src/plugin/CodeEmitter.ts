import type {
    Compilation,
    Module
} from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
import { Logger } from "./Logger";


/**
 * Configuration options are supplied to the code emitter based on
 * the dictionary object passed into Plugin constructor.
 *
 * These values determine how exported symbols from the entry module
 * are attached to the global namespace in the emitted GAS-safe output.
 */
type EmitterOpts = {
    /**
     * The root global namespace under which all emitted symbols are attached.
     *
     * Example:
     *   namespaceRoot: "MYADDON"
     *
     * Combined with `subsystem`, this forms the full namespace path
     * (e.g. "MYADDON.GAS", "MYADDON.UI", "MYADDON.COMMON").
     */
    namespaceRoot: string;

    /**
     * The logical subsystem being emitted (e.g. "GAS", "UI", "COMMON").
     *
     * This value is appended to `namespaceRoot` to produce the final
     * namespace used for symbol attachment.
     *
     * Advanced users may supply a dotted path to create deeper hierarchies
     * (e.g. "UI.Dialogs").
     */
    subsystem: string;

    /**
     * Optional override for how a default export is exposed on the namespace.
     *
     * If omitted, default exports are mapped to the symbol name "defaultExport".
     * If provided, the default export is attached using the supplied name.
     */
    defaultExportName?: string;
};

/**
 * Describes a single exported symbol binding to be emitted.
 *
 * Each binding represents the relationship between a symbol name
 * exposed on the global namespace and the corresponding local identifier
 * defined in the transpiled module source.
 */
type ExportBinding = {
    /**
     * The name under which the symbol is attached to the global namespace.
     *
     * Example:
     *   globalThis.MYADDON.GAS[exportName] = localName;
     */
    exportName: string;

    /**
     * The local identifier that exists in the emitted module source.
     *
     * This must refer to a real, top-level function or class name
     * present after Webpack transpilation.
     */
    localName: string;
};


/**
 * Describes the resolved Webpack entrypoint selected for demodulification.
 *
 * This structure captures the minimum information required to flatten a
 * Webpack bundle into GAS-compatible output without executing Webpack's runtime.
 *
 * Design invariant:
 * - Exactly one entrypoint is processed per Webpack configuration.
 * - If multiple entrypoints exist, the first encountered entrypoint is selected.
 */
type ResolvedEntrypoint = {
    /**
     * Logical name of the entrypoint as defined in webpack.config.js.
     *
     * Example:
     *   entry: { gas: "./src/gas/index.ts" }
     *   → entryName === "gas"
     *
     * This name typically reflects subsystem intent (GAS, UI, COMMON)
     * and is commonly used for output filename derivation and logging.
     */
    entryName: string | undefined;

    /**
     * Root Webpack module corresponding to the entrypoint source file
     * (e.g. "./src/gas/index.ts").
     *
     * This module:
     * - Anchors the module dependency graph
     * - Provides authoritative export metadata
     * - Is used to extract transpiled JavaScript source
     */
    entryModule: Module | undefined;

    /**
     * Webpack runtime identifier associated with the entry chunk.
     *
     * Required to retrieve the correct code-generation output from
     * compilation.codeGenerationResults.
     *
     * This is a Webpack-internal concept and is unrelated to GAS or browser runtimes.
     */
    runtime: any | undefined;
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

        const { entryModule, runtime, entryName } =
            getEntryModuleAndRuntime(compilation);

        if (!entryModule || !entryName) {
            logger.info("No entry module or entry name found; aborting emission");
            return;
        }

        const rawModuleSource =
            runtime
                ? getModuleSource(compilation, entryModule, runtime)
                : "";

        const sanitizedModuleSource =
            sanitizeWebpackHelpers(rawModuleSource, logger);

        const exportBindings =
            getExportBindings(compilation, entryModule, logger, opts);

        const content =
            getGasSafeOutput(namespace, sanitizedModuleSource, exportBindings);

        cleanupJsAssets(compilation, logger);

        // 🔑 Output filename derived from Webpack entry name
        const outputName = `${entryName}.gs`;

        compilation.emitAsset(
            outputName,
            new sources.RawSource(content)
        );

        logger.debug(`Emitted assets: ${outputName}`);
    };
}


/**
 * Resolves the single entry module and its runtime information from the Webpack compilation.
 *
 * Invariant:
 *   GASDemodulifyPlugin requires exactly one Webpack entrypoint per compilation.
 *
 * Rationale:
 *   - Each Webpack config corresponds to exactly one GAS subsystem (GAS, UI, COMMON, etc.)
 *   - GAS loads `.gs` files lexicographically; multi-entry builds would introduce
 *     ambiguous ordering and namespace collisions.
 *   - Explicit single-entry enforcement prevents silent misconfiguration.
 *
 * If more than one entrypoint is present, this function throws.
 *
 * @throws Error if the compilation defines zero or more than one entrypoint.
 */
function getEntryModuleAndRuntime( compilation: Compilation ): ResolvedEntrypoint {

    const candidates: ResolvedEntrypoint[] = [];

    for (const [entryName, entrypoint] of compilation.entrypoints) {
        const chunk = entrypoint.getEntrypointChunk();
        const runtime = chunk.runtime;

        let entryModule: Module | undefined;

        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            entryModule = module;
            break;
        }

        // Ignore entrypoints that do not originate from TypeScript
        const resource = (entryModule as any)?.resource;
        if (typeof resource === "string" && resource.endsWith(".ts")) {
            candidates.push({ entryName, entryModule, runtime });
        }
    }

    if (candidates.length !== 1) {
        const names = candidates.map(c => c.entryName).join(", ");
        throw new Error(
            `GASDemodulifyPlugin requires exactly one TypeScript entrypoint, ` +
            `but found ${candidates.length}: [${names}]`
        );
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

/**
 * Returns true for "synthetic" exports that are not authored by the user.
 *
 * "__esModule" is a boolean flag injected by bundlers (e.g. Webpack) as an interop marker
 * for ES module / CommonJS compatibility, and it answers the T/F question:
 * "did this value originate from an ES module?".
 *
 * It does not correspond to a real exported symbol in the user's source code and must not be exposed on the
 * GAS namespace.
 */
function isSyntheticExport(name: string): boolean {
    return name === "__esModule";
}


/**
 * Discovers and validates the explicit export surface of the Webpack entry module.
 *
 * This function translates Webpack's `ExportsInfo` metadata into a concrete list
 * of export bindings that can be safely attached to a Google Apps Script
 * global namespace.
 *
 * ## Responsibilities
 *
 * 1. **Enumerate explicit exports**
 *    - Iterates over the entry module's declared exports
 *    - Filters out synthetic / bundler-injected exports (e.g. "__esModule")
 *    - Preserves named exports verbatim
 *
 * 2. **Handle default exports deterministically**
 *    - Default exports are mapped to:
 *        - `opts.defaultExportName` if provided
 *        - `"defaultExport"` otherwise
 *    - No attempt is made to infer original symbol names
 *
 * 3. **Enforce export-surface determinism (fail-fast)**        -- see Guardrail, below
 *    - Wildcard re-exports (`export * from "./module"`) are explicitly unsupported
 *    - These manifest in Webpack as `exportsInfo.otherExportsInfo`
 *    - If the export surface cannot be statically enumerated at build time,
 *      the build fails with a clear, actionable error
 *
 *    Rationale:
 *    Google Apps Script requires a fully known, explicit global surface.
 *    Wildcard re-exports prevent safe namespace flattening and can lead to
 *    silent miscompilation.
 *
 * 4. **Normalize Webpack iterables**
 *    - `exportsInfo.orderedExports` is an Iterable, not a guaranteed Array
 *    - This function normalizes it via `Array.from(...)` to avoid runtime errors
 *
 * ## Design Invariants
 *
 * - All emitted exports correspond to real, top-level identifiers
 * - No Webpack runtime artifacts are exposed
 * - The export surface is fully known at build time
 * - Unsupported patterns fail fast rather than miscompile
 *
 * @throws Error
 *   If the entry module uses wildcard re-exports or otherwise exposes
 *   a non-enumerable export surface.
 */
function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
    logger: Logger,
    opts: EmitterOpts
): ExportBinding[] {

    const bindings: ExportBinding[] = [];
    const exportsInfo = compilation.moduleGraph.getExportsInfo(entryModule);

    const other = exportsInfo.otherExportsInfo;                 // Guard rail: wildcard re-exports are disallowed
    if (other && other.provided !== false) {
        const resource = (entryModule as any)?.resource ?? "<unknown>";
        throw new Error(
            [
                "gas-demodulify: Unsupported wildcard re-export detected.",
                "",
                "This build uses `export * from \"./module\"`, which cannot be safely",
                "flattened into a Google Apps Script global namespace.",
                "",
                "Workaround:",
                "Replace wildcard re-exports with explicit named re-exports:",
                "  export { foo, bar } from \"./module\";",
                "",
                `Entry module: ${resource}`
            ].join("\n")
        );
    }

    /**
     * Webpack does not guarantee that `orderedExports` is a concrete Array.
     * Normalize the iterable to avoid relying on undocumented internal behavior.
     */
    const orderedExports = Array.from(exportsInfo.orderedExports);

    for (const exportInfo of orderedExports) {
        if (isSyntheticExport(exportInfo.name))
            continue;

        if (exportInfo.name === "default") {
            const exportName = opts.defaultExportName ?? "defaultExport";

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

    logger.debug(
        `Discovered exports from entry module: ${bindings
            .map(b => `${b.exportName} ← ${b.localName}`)
            .join(", ")}`
    );

    return bindings;
}

// ======================================================
// Helpers
// ======================================================

function getModuleSource(
    compilation: Compilation,
    module: Module,
    runtime: any
): string {
    const codeGenResults = compilation.codeGenerationResults;
    if (!codeGenResults) return "";

    const codeGen = codeGenResults.get(module, runtime);
    if (!codeGen) return "";

    const source = codeGen.sources.get("javascript");
    if (!source) return "";

    return source.source().toString();
}

/**
 * Remove Webpack codegen helper artifacts from the module body.
 * Operates conservatively at the line level.
 */
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
        logger.debug(
            `Removed ${removed} Webpack helper line(s) from module source`
        );
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

    logger.debug(
        `Assets after cleanup: ${Object.keys(compilation.assets).join(", ")}`
    );
}
