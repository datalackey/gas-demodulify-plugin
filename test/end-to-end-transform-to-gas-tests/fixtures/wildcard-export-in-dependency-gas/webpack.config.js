const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist");

module.exports = {
    mode: "production",
    entry: {
        gas: path.resolve(__dirname, "src/gas/index.ts"),
    },
    output: {
        path: path.join(__dirname, "dist"),
        filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME",
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [
        new GASDemodulifyPlugin({
            namespaceRoot: "TEST",
            subsystem: "GAS",
        }),
    ],
};
