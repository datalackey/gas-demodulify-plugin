const path = require("path");
const GASDemodulifyPlugin = require("../../../../dist");

module.exports = {
    mode: "production",
    context: __dirname,

    entry: {
        gasA: "./src/gas/a.ts",
        gasB: "./src/gas/b.ts",
    },

    output: {
        path: path.join(__dirname, "dist"),
        filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME",
    },

    module: {
        rules: [
            {
                test: /\.ts$/,
                use: [
                    {
                        loader: "ts-loader",
                        options: {
                            transpileOnly: true,
                        },
                    },
                ],
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
