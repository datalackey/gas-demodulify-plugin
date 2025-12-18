const path = require("path");
const GASDemodulifyPlugin = require("../../../dist").default;


module.exports = {
    mode: "production",
    entry: {
        gas: path.resolve(__dirname, "src/gas/index.ts")
    },
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "[name].js"
    },
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            }
        ]
    },
    plugins: [
        new GASDemodulifyPlugin({
            namespaceRoot: "TEST",
            subsystem: "GAS"
        })
    ]
};

