import GASDemodulifyPlugin from "../../src/plugin/GASDemodulifyPlugin";
import type { Compiler } from "webpack";

/**
 * Minimal compiler stub sufficient to trigger configuration validation.
 */
function makeCompiler(entry: any): Compiler {
    return {
        options: {
            entry,
            output: {
                filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME",
            },
        },
        hooks: {
            thisCompilation: {
                tap(_name: string, _fn: () => void) {
                    /* intentionally empty */
                },
            },
        },
    } as unknown as Compiler;
}

describe("assertSingleEntry enforcement", () => {
    test("throws when entry is missing", () => {
        const compiler = makeCompiler(undefined);
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).toThrow(/requires a Webpack entry object/i);
    });

    test("throws when entry is a function", () => {
        const compiler = makeCompiler(() => ({}));
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).toThrow(/function entries are not supported/i);
    });

    test("throws when entry is a string", () => {
        const compiler = makeCompiler("./src/index.ts");
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).toThrow(/object-based Webpack entry/i);
    });

    test("throws when entry is an array", () => {
        const compiler = makeCompiler(["./a.ts"]);
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).toThrow(/array entries are not supported/i);
    });

    test("throws when entry object has zero keys", () => {
        const compiler = makeCompiler({});
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).toThrow(/found 0/i);
    });

    test("throws when entry object has multiple keys", () => {
        const compiler = makeCompiler({
            gasA: "./a.ts",
            gasB: "./b.ts",
        });
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).toThrow(/found 2/i);
    });

    test("does not throw when entry object has exactly one key", () => {
        const compiler = makeCompiler({
            gas: "./src/index.ts",
        });
        const plugin = new GASDemodulifyPlugin();

        expect(() => plugin.apply(compiler)).not.toThrow();
    });
});
