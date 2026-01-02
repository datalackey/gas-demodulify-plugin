/**
 * Remove JavaScript-style comments from source while preserving string literals.
 * This is a small stateful scanner that handles:
 *  - single-line // comments
 *  - block /* ... *\/
 *  - single-quoted, double-quoted, and backtick strings (with escapes)
 */
export function stripCommentsPreserveStrings(src: string): string {
    let out = "";
    let i = 0;
    const n = src.length;
    let inSingle = false;
    let inDouble = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let escape = false;

    while (i < n) {
        const ch = src[i];
        const next = i + 1 < n ? src[i + 1] : "";

        if (inLineComment) {
            if (ch === "\n") {
                inLineComment = false;
                out += ch; // keep newline
            }
            i++;
            continue;
        }

        if (inBlockComment) {
            if (ch === "*" && next === "/") {
                inBlockComment = false;
                i += 2;
            } else {
                i++;
            }
            continue;
        }

        if (inSingle) {
            out += ch;
            if (!escape && ch === "'") {
                inSingle = false;
            }
            escape = !escape && ch === "\\";
            i++;
            continue;
        }

        if (inDouble) {
            out += ch;
            if (!escape && ch === '"') {
                inDouble = false;
            }
            escape = !escape && ch === "\\";
            i++;
            continue;
        }

        if (inBacktick) {
            out += ch;
            if (!escape && ch === "`") {
                inBacktick = false;
            }
            escape = !escape && ch === "\\";
            i++;
            continue;
        }

        // not in any string or comment
        if (ch === "/" && next === "/") {
            inLineComment = true;
            i += 2;
            continue;
        }

        if (ch === "/" && next === "*") {
            inBlockComment = true;
            i += 2;
            continue;
        }

        if (ch === "'") {
            inSingle = true;
            out += ch;
            i++;
            continue;
        }

        if (ch === '"') {
            inDouble = true;
            out += ch;
            i++;
            continue;
        }

        if (ch === "`") {
            inBacktick = true;
            out += ch;
            i++;
            continue;
        }

        out += ch;
        i++;
    }

    return out;
}

