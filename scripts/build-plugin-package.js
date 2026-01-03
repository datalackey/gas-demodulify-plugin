// scripts/build-plugin-package.js
const fs = require("fs");
const path = require("path");
const rootPkg = require("../package.json");

const outDir = path.resolve(__dirname, "../dist/plugin");

const pkg = {
    name: "gas-demodulify-plugin",
    version: rootPkg.version,
    main: "GASDemodulifyPlugin.js",
    license: "MIT"
};

// Ensure dist/plugin exists
fs.mkdirSync(outDir, { recursive: true });

// Write package.json
fs.writeFileSync(
    path.join(outDir, "package.json"),
    JSON.stringify(pkg, null, 2)
);
