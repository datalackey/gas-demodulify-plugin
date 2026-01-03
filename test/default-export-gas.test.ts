import path from "path";
import fs from "fs";
import { runWebpack } from "./utils/runWebpack";
import { readStrippedFile } from "./utils/readStrippedFile";

test(
    "default-export-gas",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "default-export-gas"
        );

        const distDir = path.join(fixtureDir, "dist");

        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        await runWebpack(path.join(fixtureDir, "webpack.config.js"));

        const actual = readStrippedFile(
            path.join(distDir, "backend.gs")
        );

        expect(actual).toContain("function foo");
        expect(actual).toContain(
            "globalThis.MYADDON.GAS.defaultExport = defaultExport;"
        );
    },
    20_000
);
