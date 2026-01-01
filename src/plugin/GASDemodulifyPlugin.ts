// File: `src/plugin/GASDemodulifyPlugin.ts`

import type { Compiler } from "webpack";
import { getEmitterFunc } from "./CodeEmitter";
import { Logger, LogLevel } from "./Logger";

/**
 * Public configuration options for GASDemodulifyPlugin.
 *
 * These options are supplied by the consumer when constructing the plugin
 * instance in `webpack.config.js`.
 *
 * They control:
 *  - how emitted symbols are namespaced
 *  - which logical subsystem is being built
 *  - which artifacts are emitted
 *  - how much diagnostic output is produced
 */
export interface GASDemodulifyOptions {
    /**
     * The root global namespace under which all generated symbols are attached.
     *
     * Example:
     *   namespaceRoot: "MYADDON"
     *
     * This value becomes the first segment of every emitted namespace path.
     */
    namespaceRoot: string;

    /**
     * Logical subsystem name.
     *
     * Examples:
     *  - "GAS"
     *  - "UI"
     *  - "COMMON"
     *
     * Combined with `namespaceRoot`, this produces the final namespace
     * used for symbol attachment (e.g. "MYADDON.GAS").
     */
    subsystem: string;

    /**
     * Controls which artifacts are emitted by the plugin.
     *
     *  - "gas"    → emit `.gs` only
     *  - "ui"     → emit `.html` only
     *  - "common" → emit both `.gs` and `.html`
     *
     * NOTE:
     * The current implementation wires this option through the plugin API,
     * but artifact branching logic is handled elsewhere.
     */
    buildMode: "gas" | "ui" | "common";

    /**
     * Optional logging verbosity.
     *
     *  - "silent" → no output
     *  - "info"   → high-level lifecycle messages
     *  - "debug"  → detailed internal diagnostics
     *
     * If omitted, logging defaults to "silent".
     */
    logLevel?: "silent" | "info" | "debug";
}

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
 *  - All substantive transformation logic lives in CodeEmitter.ts
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
         * The `thisCompilation` hook fires once per compilation.
         *
         * We use it instead of `compiler.hooks.compilation` so that:
         *  - we get a fresh Compilation object
         *  - we can safely attach to compilation-scoped hooks
         */
        compiler.hooks.thisCompilation.tap(
            "GASDemodulifyPlugin",
            compilation => {
                Logger.debug("Entered thisCompilation hook");

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
                     * getEmitterFunc returns a zero-argument function
                     * that closes over:
                     *  - the compilation
                     *  - resolved plugin options
                     *  - the logger
                     *
                     * This keeps Webpack lifecycle concerns isolated here,
                     * while CodeEmitter focuses purely on transformation logic.
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

function resolveLogLevel(explicit?: LogLevel): LogLevel {     // TODO delete ?
    if (explicit) return explicit;

    const env = process.env.LOGLEVEL?.toLowerCase();
    if (env === "debug" || env === "info" || env === "silent") {
        return env;
    }

    return "info"; // default
}


module.exports = GASDemodulifyPlugin;


