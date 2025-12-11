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


test("minimal GAS subsystem build",

    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "minimal-gas"
        );

        const distDir = path.join(fixtureDir, "dist");
        const expectedDir = path.join(fixtureDir, "expected");


        // clean dist
        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        // run webpack
        await runWebpack(path.join(fixtureDir, "webpack.config.js"));


        const actual = fs.readFileSync(
            path.join(distDir, "backend.gs"),
            "utf8"
        );

        const expected = fs.readFileSync(
            path.join(expectedDir, "backend.gs"),
            "utf8"
        );


        // Actual file must be there and emitted javascript cruft must be deleted from dist dir (part of plugin flow)
        expect(actual.trim()).toBe(expected.trim());
        expect(fs.existsSync(path.join(distDir, "deliberate_cruft.js"))).toBe(false);

    },

    20_000
);
