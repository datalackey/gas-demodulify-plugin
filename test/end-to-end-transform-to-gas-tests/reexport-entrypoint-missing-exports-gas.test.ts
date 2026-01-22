import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test("reexport-entrypoint-missing-exports-gas", async () => {
    const fixtureDir = path.join(__dirname, "fixtures", "reexport-entrypoint-missing-exports-gas");

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await expect(runWebpack(path.join(fixtureDir, "webpack.config.js"))).rejects.toThrow(
        /gas-demodulify: Unable to emit code for module/
    );
}, 30_000);
