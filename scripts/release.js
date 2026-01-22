const { execSync } = require("node:child_process");

function step(label, cmd) {
    console.log(`==> ${label}`);
    try {
        execSync(cmd, { stdio: "inherit" });
    } catch {
        console.error(`❌ ${label} failed`);
        process.exit(1);
    }
}

step("Checking format", "npm run  format:check");
step("Checking TOCs", "npm run docs:toc:check");
step("Building", "npm run build");
step("Packaging plugin", "node scripts/build-plugin-package.js");

console.log("✅ Release completed successfully");
