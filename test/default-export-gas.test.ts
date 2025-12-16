import path from "path";
import fs from "fs";
import webpack from "webpack";

function runWebpack(configPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const config = require(configPath);
        webpack(config, (err, stats) => {
            if (err) return reject(err);
            if (stats?.hasErrors()) {
                return reject(stats.toJson().errors);
            }
            resolve();
        });
    });
}

test("default export maps to defaultExport when option not set", async () => {
    const fixtureDir = path.join(
        __dirname,
        "fixtures",
        "default-export-gas"
    );

    const distDir = path.join(fixtureDir, "dist");

    fs.rmSync(distDir, { recursive: true, force: true });
    fs.mkdirSync(distDir, { recursive: true });

    await runWebpack(path.join(fixtureDir, "webpack.config.js"));

    const actual = fs.readFileSync(
        path.join(distDir, "backend.gs"),
        "utf8"
    );

    expect(actual).toContain("function foo");
    expect(actual).toContain("globalThis.MYADDON.GAS.defaultExport = foo;");
});

