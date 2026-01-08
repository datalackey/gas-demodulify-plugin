// test/end-to-end-transform-to-gas-tests/cleanup-js-assets-gas.test.ts

import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";

test(
    "cleanup-js-assets-gas",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "cleanup-js-assets-gas"
        );

        const distDir = path.join(fixtureDir, "dist");

        // Clean dist
        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        await runWebpack(
            path.join(fixtureDir, "webpack.config.js")
        );

        const files = fs.readdirSync(distDir);

        // The dist directory must contain exactly one .ts file and nothing else
        const tsFiles = files.filter(f => f.endsWith('.gs'));
        expect(tsFiles.length).toBe(1);
        // No other files allowed
        expect(files.length).toBe(1);

    },
    20_000
);
