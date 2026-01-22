import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test("side-effect-reexport-gas", async () => {
    /**
     * Every exported GAS symbol must correspond to emitted executable code.
     *
     * This test verifies that a re-exported symbol is retained at runtime
     * when the defining module is explicitly anchored via a side-effect import.
     */

    const fixtureDir = path.join(__dirname, "fixtures", "side-effect-reexport-gas");

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await runWebpack(path.join(fixtureDir, "webpack.config.js"));

    const output = readStrippedFile(path.join(distDir, "gas.gs"));

    // Namespace export exists
    expect(output).toContain("globalThis.MYADDON.GAS.onOpen = onOpen;");

    // Function body must exist at runtime
    expect(output).toMatch(/function\s+onOpen\s*\(/);

    // This artifact of Webpack's module system must not appear
    // Ensure Webpack's module artifact is NOT present on any line that doesn't contain '--'
    expect(output).not.toMatch(/^(?!.*--)\s*exports\.onOpen\s*=\s*onOpen;?\s*$/m);
}, 30_000);
