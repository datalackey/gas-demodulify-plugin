import path from "path";
import { runWebpack } from "./utils/runWebpack";

test(
    "fails fast on namespace wildcard re-export (export * as ns from)",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "wildcard-namespace-reexport-gas"
        );

        await expect(
            runWebpack(path.join(fixtureDir, "webpack.config.js"))
        ).rejects.toThrow("Unsupported wildcard re-export");
    },
    20_000
);
