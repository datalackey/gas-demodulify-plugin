// File: `src/plugin/GASDemodulifyPlugin.ts`

import type { Compiler } from "webpack";
import { getEmitterFunc } from "./CodeEmitter";
import { Logger } from "./Logger";
import type { GASDemodulifyOptions } from "./options.schema";



/**
 * Webpack plugin entrypoint for gas-demodulify.
 *
 * This class is responsible for:
 *  - registering compilation hooks
 *  - constructing a logger
 *  - delegating all demodulification logic to CodeEmitter
 *
 * Design notes:
 *  - This class is intentionally thin
 *  - All substantive transformation logic lives in CodeEmitter.ts (getEmitterFunc)
 *  - This keeps Webpack lifecycle wiring separate from code-generation logic
 */
class GASDemodulifyPlugin {
    private options: GASDemodulifyOptions;

    /**
     * Constructs a new GASDemodulifyPlugin instance.
     *
     * @param options User-supplied plugin configuration
     */
    constructor(options: GASDemodulifyOptions) {
        this.options = options;
        Logger.setLevel(options.logLevel);

        Logger.info(
            `Initialized GASDemodulifyPlugin ` +
            `(namespaceRoot=${options.namespaceRoot}, ` +
            `subsystem=${options.subsystem}, ` +
            `buildMode=${options.buildMode})`
        );
    }

    /**
     * Standard Webpack plugin hook.
     *
     * This method is invoked once by Webpack during compiler setup.
     * It is responsible for registering all hooks used by the plugin.
     *
     * @param compiler The active Webpack compiler instance
     */
    apply(compiler: Compiler) {

        /**
         * The `thisCompilation` hook fires once for each build execution.
         *
         * Notes:
         *  - A single Compiler may produce multiple Compilations over time
         *    (watch mode, dev server, rebuilds).
         *  - All asset mutation must be scoped to the current Compilation.
         */
        compiler.hooks.thisCompilation.tap(
            "GASDemodulifyPlugin",
            compilation => {
                Logger.info("Starting GAS demodulification for new compilation");
                Logger.debug("Entered hook: 'thisCompilation'");

                /**
                 * The `processAssets` hook allows mutation of emitted assets
                 * after Webpack has completed code generation but before files
                 * are written to disk.
                 *
                 * This is the ideal phase to:
                 *  - extract transpiled module sources
                 *  - delete Webpack-emitted `.js` artifacts
                 *  - emit GAS-safe `.gs` / `.html` outputs
                 */
                Logger.info("Registering GAS demodulification asset processor");

                compilation.hooks.processAssets.tap(
                    {
                        name: "GASDemodulifyPlugin",
                        stage:
                        compiler.webpack.Compilation
                            .PROCESS_ASSETS_STAGE_OPTIMIZE
                    },

                    /**
                     * Delegate all asset processing to CodeEmitter.
                     *
                     */
                    getEmitterFunc(compilation, {
                        namespaceRoot: this.options.namespaceRoot,
                        subsystem: this.options.subsystem
                    })
                );
            }
        );
    }
}

module.exports = GASDemodulifyPlugin;
