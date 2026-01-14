import path from "path";
import fs from "fs";
import { runWebpack } from "../utils/runWebpack";
import { readStrippedFile } from "../utils/readStrippedFile";

test(
    "aliased-reexport-gas",
    async () => {
        /**
         * An aliased GAS export must bind to a real runtime identifier.
         *
         * Aliased re-exports must preserve:
         *  - the defining module of the original symbol
         *  - the aliased export name on the GAS namespace
         *
         * This test asserts that:
         *  - the function body for the original symbol exists
         *  - the aliased name is used on the GAS export surface
         *  - no unaliased export is emitted
         */

        const fixtureDir = path.join(
            __dirname,
            "fixtures",
            "aliased-reexport-gas"
        );

        const distDir = path.join(fixtureDir, "dist");

        fs.rmSync(distDir, { recursive: true, force: true });
        fs.mkdirSync(distDir, { recursive: true });

        await runWebpack(
            path.join(fixtureDir, "webpack.config.js")
        );

        const output = readStrippedFile(
            path.join(distDir, "gas.gs")
        );

        // Function body must exist (defining module preserved)
        expect(output).toMatch(/function\s+onOpen\s*\(/);

        // Aliased export must exist
        expect(output).toContain(
            "globalThis.MYADDON.GAS.handleOpen = onOpen;"
        );

        // Original name must NOT be exported
        expect(output).not.toContain(
            "globalThis.MYADDON.GAS.onOpen"
        );
    },
    30_000
);
