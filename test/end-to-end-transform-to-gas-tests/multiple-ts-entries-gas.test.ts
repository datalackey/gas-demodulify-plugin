import path from "path";
import { runWebpack } from "../utils/runWebpack";

test(
  "multiple-ts-entries-gas",
  async () => {
    const fixtureDir = path.join(
      __dirname,
      "fixtures",
      "multiple-ts-entries-gas"
    );

    await expect(
      runWebpack(path.join(fixtureDir, "webpack.config.js"))
    ).rejects.toThrow(/exactly one Webpack entry/i);
  },
  20_000
);
