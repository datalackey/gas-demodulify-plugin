import webpack from "webpack";
import fs from "fs";
import path from "path";
import { FORBIDDEN_WEBPACK_RUNTIME_PATTERNS } from "../../src/plugin/invariants";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const strip = require("strip-comments");

/**
 * Global GAS safety invariants enforced for all Webpack-based tests.
 *
 * Any successful build must NOT emit Webpack runtime artifacts
 * into GAS output (.gs files).
 */
const INVARIANT_MSG = "Invariant violation: GAS output must not contain Webpack runtime artifacts";

/**
 * Runs Webpack for a fixture config and enforces GAS output invariants.
 *
 * IMPORTANT:
 * - Any compilation error (even if Webpack does not mark the build as failed)
 *   causes this Promise to reject.
 */
export function runWebpack(configPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const config = require(configPath);

        webpack(config, (err, stats) => {
            // 1. Fatal compiler error
            if (err) {
                return reject(err);
            }

            // 2. ANY compilation errors (plugin throws land here)
            const compilationErrors = stats?.compilation?.errors ?? [];

            if (compilationErrors.length > 0) {
                const message = compilationErrors
                    .map(e =>
                        e instanceof Error ? e.message : typeof e === "string" ? e : String(e)
                    )
                    .join("\n\n");

                return reject(new Error(message));
            }

            const outputDir = path.join(path.dirname(configPath), "dist");

            if (!fs.existsSync(outputDir)) {
                return resolve();
            }

            const offenders: string[] = [];

            for (const file of fs.readdirSync(outputDir)) {
                if (!file.endsWith(".gs")) continue;

                const fullPath = path.join(outputDir, file);
                const content = fs.readFileSync(fullPath, "utf8");

                const uncommented = strip(content);

                for (const pattern of FORBIDDEN_WEBPACK_RUNTIME_PATTERNS) {
                    if (pattern.test(uncommented)) {
                        offenders.push(`${fullPath} (matched: ${pattern})`);
                        break;
                    }
                }
            }

            if (offenders.length > 0) {
                return reject(
                    new Error(`${INVARIANT_MSG}\n` + offenders.map(f => `  - ${f}`).join("\n"))
                );
            }

            resolve();
        });
    });
}
