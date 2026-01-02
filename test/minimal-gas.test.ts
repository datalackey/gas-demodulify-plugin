import path from "path";
import fs from "fs";
import { runWebpack } from "./utils/runWebpack";
import { readStrippedFile } from "./utils/readStrippedFile";


test("minimal GAS subsystem build",

    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "minimal-gas"
        );

        const distDir = path.join(fixtureDir, "dist");
        const expectedDir = path.join(fixtureDir, "expected");


        // clean dist
        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        // run webpack
        await runWebpack(path.join(fixtureDir, "webpack.config.js"));


        const actual = readStrippedFile(
            path.join(distDir, "backend.gs")
        );

        expect(actual).toContain('globalThis.MYADDON.GAS.hello = hello;');
        expect(actual).toContain('globalThis.MYADDON.GAS.goodbye = goodbye;');
        expect(actual).toContain('function hello');
        expect(actual).toContain('function goodbye');

        expect(actual).not.toContain('deliberate_cruft.js');
        expect(fs.existsSync(path.join(distDir, "deliberate_cruft.js"))).toBe(false);
    },

    20_000
);
