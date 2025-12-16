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

        let {entryModule, runtime} = getEntryModuleAndRuntime(compilation);
        if (!entryModule) {
            logger.info("No entry module found; aborting emission");
            return;
        }

        const exportedSymbolNames: string[] = getExportedSymbolNames(compilation, entryModule,  logger);
        const moduleSource =
            entryModule && runtime
                ? getModuleSource(compilation, entryModule, runtime)
                : "";
        const content = getGasSafeOutput(namespace, moduleSource, exportedSymbolNames);

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
    return {entryModule, runtime};
}

function getGasSafeOutput(namespace: string, moduleSource: string, exportedSymbolNames: string[]) {
    return dedent`
            ${renderNamespaceInit(namespace)}

            // Module code (transpiled)
            ${moduleSource}

            // Export surface
            ${exportedSymbolNames
        .map(name => `globalThis.${namespace}.${name} = ${name};`)
        .join("\n")}
        `;
}



function getExportedSymbolNames(compilation: Compilation, entryModule: Module, logger: Logger) : string[] {

    function isSyntheticExport(name: string): boolean {
        return name === "__esModule";
    }


    const exportedNames: string[] = [];
    const exportsInfo = compilation.moduleGraph.getExportsInfo(entryModule);
    for (const exportInfo of exportsInfo.orderedExports) {
        if (typeof exportInfo.name === "string" && !isSyntheticExport(exportInfo.name)) {
            exportedNames.push(exportInfo.name);
        }
    }
    if (exportedNames.length === 0) {
        logger.info(
            "No named exports discovered in entry module; no globals emitted"
        );
    }
    logger.debug(
        `Discovered exports from entry module: ${exportedNames.join(", ")}`
    );
    return exportedNames;
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
