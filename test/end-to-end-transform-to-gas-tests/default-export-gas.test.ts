import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test("default-export-gas", async () => {
    const fixtureDir = path.join(__dirname, "fixtures", "default-export-gas");

    const distDir = path.join(fixtureDir, "dist");

    // clean dist
    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    // run webpack
    await runWebpack(path.join(fixtureDir, "webpack.config.js"));

    // read output
    const actual = readStrippedFile(path.join(distDir, "backend.gs"));

    // functional assertions (existing behavior)
    expect(actual).toContain("function foo");
    expect(actual).toContain("globalThis.MYADDON.GAS.defaultExport = defaultExport;");
}, 30_000);
