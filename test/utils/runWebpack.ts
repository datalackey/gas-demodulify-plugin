import webpack from "webpack";

export function runWebpack(configPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // use require so test fixtures can provide CommonJS config
        // eslint-disable-next-line @typescript-eslint/no-var-requires
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

