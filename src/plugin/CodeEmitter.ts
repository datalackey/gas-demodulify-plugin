import type {
    Compilation,
    Module
} from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
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


export function getEmitterFunc(
    logger: Logger,
    compilation: Compilation,
    opts: EmitterOpts
) {
    return () => {
        logger.debug("Entered processAssets hook");

        const namespace = `${opts.namespaceRoot}.${opts.subsystem}`;
        logger.debug(`Computed namespace: ${namespace}`);

        let { entryModule, runtime } = getEntryModuleAndRuntime(compilation);
        if (!entryModule) {
            logger.info("No entry module found; aborting emission");
            return;
        }

        const exportBindings =
            getExportBindings(compilation, entryModule, logger, opts);

        const rawModuleSource =
            entryModule && runtime
                ? getModuleSource(compilation, entryModule, runtime)
                : "";

        const sanitizedModuleSource =
            sanitizeWebpackHelpers(rawModuleSource, logger);

        const content =
            getGasSafeOutput(namespace, sanitizedModuleSource, exportBindings);

        cleanupJsAssets(compilation, logger);

        const outputName = "backend.gs";

        compilation.emitAsset(
            outputName,
            new sources.RawSource(content)
        );
        logger.debug(`Emitted assets: ${outputName}`);
    };
}

function getEntryModuleAndRuntime(compilation: Compilation) {
    let entryModule: Module | undefined;
    let runtime: any | undefined;

    for (const [, entrypoint] of compilation.entrypoints) {
        const chunk = entrypoint.getEntrypointChunk();
        runtime = chunk.runtime;

        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            entryModule = module;
            break;
        }
        if (entryModule) break;
    }

    return { entryModule, runtime };
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

function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
    logger: Logger,
    opts: EmitterOpts
): ExportBinding[] {

    const bindings: ExportBinding[] = [];
    const exportsInfo = compilation.moduleGraph.getExportsInfo(entryModule);

    for (const exportInfo of exportsInfo.orderedExports) {
        if (typeof exportInfo.name !== "string") continue;
        if (isSyntheticExport(exportInfo.name)) continue;



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
    if (!codeGenResults) {
        return "";
    }

    const codeGen = codeGenResults.get(module, runtime);
    if (!codeGen) {
        return "";
    }

    const source = codeGen.sources.get("javascript");
    if (!source) {
        return "";
    }

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
    if (!source.trim()) {
        return source;
    }

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
