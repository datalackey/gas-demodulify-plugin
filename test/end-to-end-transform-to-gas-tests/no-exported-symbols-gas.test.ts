import path from "path";
import { runWebpack } from "../utils/runWebpack";


test(
  "no-exported-symbols-gas",
  async () => {
    const fixtureDir = path.join(
      __dirname,
      "fixtures",
      "no-exported-symbols-gas"
    );

    await expect(
      runWebpack(path.join(fixtureDir, "webpack.config.js"))
    ).rejects.toThrow(/No exported symbols found in TypeScript entrypoint/i);
  },
  20_000
);
