const path = require("path");
const GASDemodulifyPlugin = require("../../../dist").default;

module.exports = {
  mode: "production",
  context: __dirname,

  entry: {
    gas: "./src/gas/index.ts"
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
      logLevel: "info"
    })
  ]
};

