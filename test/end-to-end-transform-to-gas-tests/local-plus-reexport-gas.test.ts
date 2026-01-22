import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test("local-plus-reexport-gas", async () => {
    /**
     * The presence of a local export must not cause
     * re-exported defining modules to be dropped.
     *
     * This test verifies that:
     *  - a locally-defined GAS export is emitted
     *  - a re-exported GAS symbol is also emitted
     *  - both defining modules survive tree-shaking
     *  - both function bodies exist at runtime
     */

    const fixtureDir = path.join(__dirname, "fixtures", "local-plus-reexport-gas");

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await runWebpack(path.join(fixtureDir, "webpack.config.js"));

    const output = readStrippedFile(path.join(distDir, "gas.gs"));

    // Local function body must exist
    expect(output).toMatch(/function\s+foo\s*\(/);

    // Re-exported function body must exist
    expect(output).toMatch(/function\s+onOpen\s*\(/);

    // Export surface must include both symbols
    expect(output).toContain("globalThis.MYADDON.GAS.foo = foo;");
    expect(output).toContain("globalThis.MYADDON.GAS.onOpen = onOpen;");

    // Ensure function definitions appear before their exports
    const fooDef = output.indexOf("function foo");
    const fooExport = output.indexOf("globalThis.MYADDON.GAS.foo = foo");

    const onOpenDef = output.indexOf("function onOpen");
    const onOpenExport = output.indexOf("globalThis.MYADDON.GAS.onOpen = onOpen");

    expect(fooDef).toBeGreaterThan(-1);
    expect(fooExport).toBeGreaterThan(-1);
    expect(fooDef).toBeLessThan(fooExport);

    expect(onOpenDef).toBeGreaterThan(-1);
    expect(onOpenExport).toBeGreaterThan(-1);
    expect(onOpenDef).toBeLessThan(onOpenExport);
}, 30_000);
