const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist");

module.exports = {
    mode: "production",
    context: __dirname,

    entry: {
        gas: "./src/gas/index.ts",
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
                use: {
                    loader: "ts-loader",
                    options: {
                        configFile: "tsconfig.json",
                    },
                },
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
