import path from "path";
import { runWebpack } from "../utils/runWebpack";

test("wildcard-export-in-dependency-gas", async () => {
    const fixtureDir = path.join(__dirname, "fixtures", "wildcard-export-in-dependency-gas");

    await expect(runWebpack(path.join(fixtureDir, "webpack.config.js"))).rejects.toThrow(
        /Unsupported wildcard re-export/
    );
}, 30_000); // 👈 REQUIRED (match your other tests)
