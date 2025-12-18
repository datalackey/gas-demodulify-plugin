import path from "path";
import fs from "fs";
import { runWebpack } from "./utils/runWebpack";

test(
    "explicit named re-export is supported",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "explicit-reexport-gas"
        );

        const distDir = path.join(fixtureDir, "dist");

        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        await runWebpack(path.join(fixtureDir, "webpack.config.js"));

        const output = fs.readFileSync(
            path.join(distDir, "gas.gs"),
            "utf8"
        );

        expect(output).toContain(
            "globalThis.MYADDON.GAS.foo = foo;"
        );
    },
    20_000
);

