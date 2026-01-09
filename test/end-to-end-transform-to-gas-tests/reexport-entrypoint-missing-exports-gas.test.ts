import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test(
    "re-export-only entrypoint emits broken GAS output (export without definition)",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "reexport-entrypoint-missing-exports-gas"
        );

        const distDir = path.join(fixtureDir, "dist");

        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        await runWebpack(path.join(fixtureDir, "webpack.config.js"));

        const output = readStrippedFile(
            path.join(distDir, "gas.gs")
        );

        // Export surface exists
        expect(output).toContain(
            "globalThis.MYADDON.GAS.onOpen = onOpen;"
        );

        // ❌ But function body is missing
        expect(output).not.toMatch(
            /function\s+onOpen\s*\(/
        );
    },
    30_000
);
