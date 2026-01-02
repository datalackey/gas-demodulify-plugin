import fs from "fs";
import { stripCommentsPreserveStrings } from "./stripCommentsPreserveStrings";

export function readStrippedFile(filePath: string): string {
    const content = fs.readFileSync(filePath, "utf8");
    return stripCommentsPreserveStrings(content);
}

