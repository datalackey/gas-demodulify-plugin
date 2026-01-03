import fs from "fs";
import path from "path";

/**
 * Guard against stale compiled artifacts being used in tests.
 * This makes sure we don't run into mystery failures due to updated source code not
 * being reflected in the compiled plugin output which is what is typically required in end-to-end-transform tests.
 *
 * If this fails, it means:
 *  - source was edited
 *  - dist was not rebuilt
 *  - Jest is executing cached JS
 */
beforeAll(() => {
    const projectRoot = path.resolve(__dirname, "..");

    const src = path.join(projectRoot, "src");
    const dist = path.join(projectRoot, "dist");

    if (!fs.existsSync(dist)) {
        throw new Error("dist/ does not exist — did you forget to compile?");
    }

    const newestSrcMtime = newestMtimeRecursive(src);
    const newestDistMtime = newestMtimeRecursive(dist);

    if (newestDistMtime < newestSrcMtime) {
        throw new Error(
            "Stale dist detected.\n" +
            "Source files are newer than compiled output.\n\n" +
            "Run `npm run compile` (or ensure compile runs before tests)."
        );
    }
});

function newestMtimeRecursive(dir: string): number {
    let newest = 0;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            newest = Math.max(newest, newestMtimeRecursive(full));
        } else {
            newest = Math.max(newest, fs.statSync(full).mtimeMs);
        }
    }

    return newest;
}
