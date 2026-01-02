import webpack from "webpack";
import fs from "fs";
import path from "path";
import {
    FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS
} from "../../src/plugin/invariants";

import { stripCommentsPreserveStrings } from "./stripCommentsPreserveStrings";

/**
 * Global GAS safety invariants enforced for all Webpack-based tests.
 *
 * Any successful build must NOT emit Webpack runtime artifacts
 * into GAS output (.gs files).
 */
const INVARIANT_MSG =
    "Invariant violation: GAS output must not contain Webpack runtime artifacts";

/**
 * Runs Webpack for a fixture config and enforces GAS output invariants.
 *
 * This function is intentionally opinionated:
 * - If Webpack emits runtime helpers into .gs files, the test FAILS
 * - All tests that call runWebpack are subject to the same constraints
 */
export function runWebpack(configPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Allow CommonJS fixture configs
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const config = require(configPath);

        webpack(config, (err, stats) => {
            if (err) return reject(err);

            if (stats?.hasErrors()) {
                return reject(stats.toJson().errors);
            }

            const outputDir = path.join(
                path.dirname(configPath),
                "dist"
            );

            if (!fs.existsSync(outputDir)) {
                return resolve();
            }

            const offenders: string[] = [];

            for (const file of fs.readdirSync(outputDir)) {
                if (!file.endsWith(".gs")) continue;

                const fullPath = path.join(outputDir, file);
                const content = fs.readFileSync(fullPath, "utf8");

                // Strip comments so that commented-out helper lines do not trigger invariants
                const uncommented = stripCommentsPreserveStrings(content);

                for (const forbidden of FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS) {
                    if (uncommented.includes(forbidden)) {
                        offenders.push(
                            `${fullPath} (found: ${forbidden})`
                        );
                        break;
                    }
                }
            }

            if (offenders.length > 0) {
                return reject(
                    new Error(
                        `${INVARIANT_MSG}\n` +
                        offenders.map(f => `  - ${f}`).join("\n")
                    )
                );
            }

            resolve();
        });
    });
}
