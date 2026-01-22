import fs from "fs";

const strip = require("strip-comments");

export function readStrippedFile(filePath: string): string {
    const content = fs.readFileSync(filePath, "utf8");
    return strip(content);
}
