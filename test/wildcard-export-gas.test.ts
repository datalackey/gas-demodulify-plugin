import path from "path";
import { runWebpack } from "./utils/runWebpack";

test(
    "fails fast on wildcard re-export (export * from)",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "wildcard-export-gas"
        );

        await expect(
            runWebpack(path.join(fixtureDir, "webpack.config.js"))
        ).rejects.toThrow("Unsupported wildcard re-export");
    },
    20_000
);
