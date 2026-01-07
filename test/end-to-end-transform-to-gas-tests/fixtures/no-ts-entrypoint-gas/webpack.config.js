const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist");

module.exports = {
  mode: "production",
  context: __dirname,

  entry: {
    junk: "./src/junk.js"
  },

  output: {
    path: path.join(__dirname, "dist"),
    filename: "IGNORED-BY-DEMODULIFY"
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
