import type { Compiler } from "webpack";
import { sources } from "webpack";

export interface GASDemodulifyOptions {
    namespaceRoot: string;
    subsystem: string;
    buildMode: "gas" | "ui" | "common";

    logLevel?: "silent" | "info" | "debug";
}


export class GASDemodulifyPlugin {
    private options: GASDemodulifyOptions;

    constructor(options: GASDemodulifyOptions) {
        this.options = options;
    }

    apply(compiler: Compiler) {
        const logger = createLogger(this.options.logLevel);

        compiler.hooks.thisCompilation.tap(
            "GASDemodulifyPlugin",
            compilation => {

                logger.debug("Entered thisCompilation hook");

                compilation.hooks.processAssets.tap(
                    {
                        name: "GASDemodulifyPlugin",
                        stage:
                        compiler.webpack.Compilation
                            .PROCESS_ASSETS_STAGE_OPTIMIZE
                    },
                    () => {

                        logger.debug("Entered processAssets hook");
                        const namespace = `${this.options.namespaceRoot}.${this.options.subsystem}`;
                        logger.debug(`Computed namespace: ${namespace}`);

                        const content = `
${renderNamespaceInit(namespace)}

// User-defined symbols
function hello() {
  return "hello from gas";
}

// Export surface
globalThis.MYADDON.GAS.hello = hello;
`.trim();

                        const assetNames = Object.keys(compilation.assets);
                        logger.debug(`Assets before cleanup: ${assetNames.join(", ")}`);

                        for (const assetName of assetNames) {
                            if (assetName.endsWith(".js")) {
                                logger.debug(`Deleting JS asset: ${assetName}`);
                                compilation.deleteAsset(assetName);
                            }
                        }

                        logger.debug(`Assets after cleanup: ${Object.keys(compilation.assets).join(", ")}`);

                        const emittedAssets: string[] = [];
                        const emittedAssetName = "backend.gs";
                        compilation.emitAsset(
                            emittedAssetName,
                            new sources.RawSource(content)
                        );
                        emittedAssets.push(emittedAssetName);

                        logger.debug(`Emitted assets: ${emittedAssets.join(", ")}`);
                    }
                );
            }
        );
    }
}



// Utility functions

function renderNamespaceInit(namespace: string): string {
  return `
// Namespace initialization
(function init(ns) {
  let o = globalThis;
  for (const p of ns.split(".")) {
    o[p] = o[p] || {};
    o = o[p];
  }
})("${namespace}");
`.trim();
}


// Logging support

type LogLevel = "silent" | "info" | "debug";

function createLogger(level: LogLevel | undefined) {
    const enabled =
        level === "info" || level === "debug";

    const debugEnabled = level === "debug";

    return {
        info(message: string) {
            if (enabled) {
                console.log(`[gas-demodulify] ${message}`);
            }
        },

        debug(message: string) {
            if (debugEnabled) {
                console.log(`[gas-demodulify][debug] ${message}`);
            }
        }
    };
}
