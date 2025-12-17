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

test(
    "GAS output filename is derived from entry name",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "output-filename-gas"
        );

        const distDir = path.join(fixtureDir, "dist");

        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        await runWebpack(path.join(fixtureDir, "webpack.config.js"));

        const files = fs.readdirSync(distDir);

        // ❌ This will FAIL with current implementation
        expect(files).toContain("gas.gs");

        // Optional sanity check
        expect(files).not.toContain("backend.gs");
    },
    20_000
);
