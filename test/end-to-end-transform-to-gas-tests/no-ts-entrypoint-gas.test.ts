import path from "path";
import { runWebpack } from "../utils/runWebpack";

test(
    "fails when no TypeScript entrypoint exists",
    async () => {
        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "no-ts-entrypoint-gas"
        );

        await expect(
            runWebpack(path.join(fixtureDir, "webpack.config.js"))
        ).rejects.toThrow(/No TypeScript entrypoint found/);
    },
    20_000
);
