// File: `src/plugin/GASDemodulifyPlugin.ts`
import type { Compiler } from "webpack";
import { getEmitterFunc} from "./CodeEmitter";
import { createLogger } from "./Logger";


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
                        stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE
                    },
                    getEmitterFunc(logger, compilation, {
                        namespaceRoot: this.options.namespaceRoot,
                        subsystem: this.options.subsystem
                    })
                );
            }
        );
    }
}
