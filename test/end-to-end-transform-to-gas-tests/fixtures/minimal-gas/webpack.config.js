const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist");

module.exports = {
    mode: "production",
    context: __dirname,

    entry: {
        backend: "./src/gas/index.ts",
    },

    output: {
        path: path.join(__dirname, "dist"),
        filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME",
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
            },
        ],
    },
    plugins: [
        new GASDemodulifyPlugin({
            namespaceRoot: "MYADDON",
            subsystem: "GAS",
            buildMode: "gas",
            logLevel: "silent",
        }),
    ],
};
