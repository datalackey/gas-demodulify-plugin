import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";

test("output-filename-gas", async () => {
    const fixtureDir = path.join(__dirname, "fixtures", "output-filename-gas");

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await runWebpack(path.join(fixtureDir, "webpack.config.js"));

    const files = fs.readdirSync(distDir);

    expect(files).toContain("gas.gs");

    // Optional sanity check
    expect(files).not.toContain("backend.gs");
}, 20_000);
