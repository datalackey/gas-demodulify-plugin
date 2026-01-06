import path from "path";
import { runWebpack } from "../utils/runWebpack";

test(
  "type-only-export-gas",
  async () => {
    const fixtureDir = path.join(
      __dirname,
      "fixtures",
      "type-only-export-gas"
    );

    await expect(
      runWebpack(path.join(fixtureDir, "webpack.config.js"))
    ).rejects.toThrow(/No exported symbols found in TypeScript entrypoint/i);
  },
  20_000
);
