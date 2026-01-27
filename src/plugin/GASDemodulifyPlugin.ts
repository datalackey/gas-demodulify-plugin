// File: `src/plugin/GASDemodulifyPlugin.ts`

import type { Compiler } from "webpack";
import { getEmitterFunc } from "./code-emission/CodeEmitter";
import { Logger } from "./Logger";
import type { GASDemodulifyOptions } from "./plugin-configuration-options/options.schema";
import { validateAndNormalizePluginOptions } from "./plugin-configuration-options/validateAndNormalizePluginOptions";

/**
 * Webpack plugin entrypoint for gas-demodulify.
 *
 * This class is responsible for:
 *  - asserting valid Webpack configuration and expected invariants
 *  - registering compilation hooks
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
     * @param unvalidatedOptions User-supplied plugin configuration (will be validated)
     */
    constructor(unvalidatedOptions?: unknown) {
        this.options = validateAndNormalizePluginOptions(unvalidatedOptions);

        Logger.setLevel(this.options.logLevel);

        Logger.info(
            `Initialized GASDemodulifyPlugin ` +
                `(namespaceRoot=${this.options.namespaceRoot}, ` +
                `subsystem=${this.options.subsystem}, ` +
                `buildMode=${this.options.buildMode})`
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
    apply(compiler: Compiler): void {
        assertOutputFileIgnored(compiler);
        assertSingleEntry(compiler);

        /**
         * The `thisCompilation` hook fires once for each build execution.
         *
         * Notes:
         *  - A single Compiler may produce multiple Compilations over time
         *    (watch mode, dev server, rebuilds).
         *  - All asset mutation must be scoped to the current Compilation.
         */
        compiler.hooks.thisCompilation.tap("GASDemodulifyPlugin", compilation => {
            Logger.info("Starting GAS demodulification for new compilation");

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
                    stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
                },

                /**
                 * Delegate all asset processing to CodeEmitter.
                 *
                 */
                getEmitterFunc(compilation, {
                    namespaceRoot: this.options.namespaceRoot,
                    subsystem: this.options.subsystem,
                })
            );
        });
    }
}

function assertOutputFileIgnored(compiler: Compiler): void {
    const output = compiler.options.output;
    const filename = output?.filename;

    if (filename !== "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME") {
        throw new Error(
            [
                "Invalid Webpack output configuration for GASDemodulifyPlugin.",
                "",
                "When GASDemodulifyPlugin is used, Webpack output is ignored.",
                "You must explicitly acknowledge this by setting:",
                "",
                '  output: { filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME" }',
                "",
                "Any other value — including omission of `output.filename` — is not allowed.",
            ].join("\n")
        );
    }
}

function assertSingleEntry(compiler: Compiler): void {
    const entry = compiler.options.entry;

    if (entry === undefined) {
        throw new Error(
            "GASDemodulifyPlugin requires a Webpack entry object with exactly one entrypoint"
        );
    }
    if (typeof entry === "function") {
        throw new Error(
            "GASDemodulifyPlugin requires exactly one Webpack entry (function entries are not supported)"
        );
    }
    if (typeof entry === "string") {
        throw new Error(
            "GASDemodulifyPlugin requires an object-based Webpack entry with exactly one named entrypoint"
        );
    }
    if (Array.isArray(entry)) {
        throw new Error(
            "GASDemodulifyPlugin requires exactly one Webpack entry (array entries are not supported)"
        );
    }

    // Now handle object-style entries. Be explicit about null and array checks
    if (typeof entry === "object" && entry !== null) {
        const keys = Object.keys(entry as Record<string, unknown>);
        if (keys.length !== 1) {
            throw new Error(
                `GASDemodulifyPlugin requires exactly one Webpack entry, but found ${keys.length}: [${keys.join(", ")}]`
            );
        }
        return;
    }

    throw new Error("Unsupported Webpack entry configuration");
}

module.exports = GASDemodulifyPlugin; // TODO - better to have only one export method
// Provide an ES default export so tests that import from the TS source succeed
export default GASDemodulifyPlugin;
