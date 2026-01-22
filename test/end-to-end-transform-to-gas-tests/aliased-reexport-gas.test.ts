import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test("aliased-reexport-gas", async () => {
    /**
     * Aliased re-exports in the GAS entry module are explicitly unsupported.
     *
     * Example (unsupported):
     *   export { onOpen as handleOpen } from "./triggers";
     */

    const fixtureDir = path.join(__dirname, "fixtures", "aliased-reexport-gas");

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await expect(runWebpack(path.join(fixtureDir, "webpack.config.js"))).rejects.toThrow(
        /Unsupported aliased re-export detected in entry module./i
    );
}, 30_000);
