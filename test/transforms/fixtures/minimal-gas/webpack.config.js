const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist")

module.exports = {
  mode: "production",
  context: __dirname,

  entry: {
    backend: "./src/gas/index.ts",
    deliberate_cruft: "./src/deliberate_cruft.js"      // This entry is to verify that any .js cruft in dist dir is cleaned up
  },

    output: {
    path: path.join(__dirname, "dist"),
    filename: "[name].js"

  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader"
      }
    ]
  },
  plugins: [
    new GASDemodulifyPlugin({
      namespaceRoot: "MYADDON",
      subsystem: "GAS",
      buildMode: "gas",
      logLevel: "silent"
    })
  ]
};
