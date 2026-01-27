const path = require("path");
const GasDemodulifyPlugin = require("gas-demodulify-plugin");
const GASDemodulifyPlugin = require("../../dist");

module.exports = {
    mode: "development",
    entry: { backend: "./src/index.ts" },
    devtool: "inline-source-map",
    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader",
                options: {
                    transpileOnly: true,
                },
            },
        ],
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    output: {
        filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME",
        path: path.resolve(__dirname, "dist"),
        libraryTarget: "this",
    },
    plugins: [new GasDemodulifyPlugin()],
    optimization: {
        splitChunks: false,
        runtimeChunk: false,
    },
};
