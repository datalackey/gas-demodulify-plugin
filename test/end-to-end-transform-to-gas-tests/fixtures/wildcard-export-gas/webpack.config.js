const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist");

module.exports = {
  mode: "production",
  context: __dirname,

  entry: {
    gas: "./src/gas/index.ts"
  },

  output: {
    path: path.join(__dirname, "dist"),
    filename: "IGNORED-BY-DEMODULIFY"
  },

  resolve: {
    extensions: [".ts", ".js"]
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
      logLevel: "debug"
    })
  ]
};

