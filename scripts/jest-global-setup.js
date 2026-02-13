// test/jest-global-setup.js
const { execSync } = require("child_process");

module.exports = async () => {
    execSync("npx nx run gas-demodulify-plugin:compile", {
        stdio: "inherit",
    });
};
