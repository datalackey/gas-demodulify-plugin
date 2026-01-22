import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

/**
 * Every exported GAS symbol must correspond to emitted executable code.
 *
 * This test verifies:
 *  - top-level side effects in the entry module are preserved (call to Logger.configure())
 *  - re-exported GAS symbols have real function bodies
 *  - defining modules for re-exports are not tree-shaken
 */
test("mixed-entry-side-effect-gas", async () => {
    const fixtureDir = path.join(__dirname, "fixtures", "mixed-entry-side-effect-gas");

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await runWebpack(path.join(fixtureDir, "webpack.config.js"));

    const output = readStrippedFile(path.join(distDir, "gas.gs"));

    // Side-effect survived
    expect(output).toContain("__LOGGER_CONFIGURED__");

    // Function body survived
    expect(output).toContain("function onOpen");

    // Export surface intact
    expect(output).toContain("globalThis.MYADDON.GAS.onOpen = onOpen;");
}, 30_000);
