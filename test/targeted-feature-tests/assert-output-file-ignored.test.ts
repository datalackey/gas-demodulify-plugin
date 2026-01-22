import GASDemodulifyPlugin from "../../src/plugin/GASDemodulifyPlugin";
import { OUTPUT_BUNDLE_FILENAME_TO_DELETE } from "../../src/plugin/code-emission/CodeEmitter";
import type { Compiler } from "webpack";

/**
 * Minimal, mock for Webpack Compiler --  intentionally tiny:
 *
 * - enough to let GASDemodulifyPlugin.apply() run
 * - no hooks actually invoked
 * - no compilation performed
 *
 * We are testing *configuration invariants*, not Webpack behavior.
 */
function makeCompiler(filename?: string): Compiler {
    return {
        options: {
            output: filename === undefined ? {} : { filename },
            entry: { gas: "./src/index.ts" }, // required to pass assertSingleEntry
        },

        hooks: {
            thisCompilation: {
                tap(_name: string, _fn: () => void) {
                    /* deliberately empty */
                },
            },
        },
    } as unknown as Compiler;
}

describe("output.filename sentinel enforcement", () => {
    test("throws when output.filename is omitted", () => {
        const compiler = makeCompiler(undefined);
        const plugin = new GASDemodulifyPlugin();

        expect(() => {
            plugin.apply(compiler);
        }).toThrow(/output\.filename/i);
    });

    test("throws when output.filename is not the sentinel", () => {
        const compiler = makeCompiler("bundle.js");
        const plugin = new GASDemodulifyPlugin();

        expect(() => {
            plugin.apply(compiler);
        }).toThrow(/OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME/i);
    });

    test("does not throw when output.filename is the sentinel", () => {
        const compiler = makeCompiler(OUTPUT_BUNDLE_FILENAME_TO_DELETE);
        const plugin = new GASDemodulifyPlugin();

        expect(() => {
            plugin.apply(compiler);
        }).not.toThrow();
    });
});
