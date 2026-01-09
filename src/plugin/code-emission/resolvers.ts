import type { Compilation, Module } from "webpack";
import fs from "fs";
import path from "path";
import { Logger } from "../Logger";
import type { ResolvedEntrypoint } from "./types";

/**
 * Resolves the single TypeScript-authored entrypoint.
 */
export function resolveTsEntrypoint(
    compilation: Compilation,
): ResolvedEntrypoint {
    Logger.debug("Resolving TypeScript entrypoint");

    const candidates: ResolvedEntrypoint[] = [];

    for (const [entryName, entrypoint] of compilation.entrypoints) {
        Logger.debug(`Inspecting entrypoint '${entryName}'`);

        const chunks: any[] = Array.from(
            (entrypoint as any).chunks ??
            (entrypoint.getEntrypointChunk
                ? [entrypoint.getEntrypointChunk()]
                : [])
        );

        Logger.debug(`Entrypoint '${entryName}' has ${chunks.length} chunk(s)`);

        for (const chunk of chunks) {
            const runtime = chunk.runtime;

            for (const m of compilation.chunkGraph.getChunkEntryModulesIterable(chunk)) {
                const res = (m as any)?.resource;
                if (typeof res === "string" && (res.endsWith(".ts") || res.endsWith(".tsx"))) {
                    Logger.debug(`Found TS entry module for '${entryName}': ${res}`);

                    candidates.push({
                        entryName,
                        entryModule: m,
                        runtime,
                        chunks
                    });
                    break;
                }
            }
        }
    }

    if (candidates.length === 0) {
        throw new Error("No TypeScript entrypoint found");
    }

    if (candidates.length > 1) {
        const names = candidates.map(c => c.entryName).join(", ");
        throw new Error(
            `GASDemodulifyPlugin requires exactly one TypeScript entrypoint, but found ${candidates.length}: [${names}]`
        );
    }

    const resolved = candidates[0];
    Logger.debug(`Resolved entrypoint '${resolved.entryName}' with ${resolved.chunks.length} chunk(s)`);

    return resolved;
}

// Wildcard re-export guard
const exportStarRe = /export\s*\*\s*(?:as\s+\w+\s*)?(?:from\s+['"]|;)/;

export function assertNoWildcardReexports(
    compilation: Compilation,
    entry: ResolvedEntrypoint
) {
    for (const chunk of entry.chunks) {
        for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            const resource = (module as any)?.resource;

            if (typeof resource === "string" && (resource.endsWith(".ts") || resource.endsWith(".tsx"))) {
                const abs = path.isAbsolute(resource)
                    ? resource
                    : path.resolve(
                        (compilation as any).options?.context ?? process.cwd(),
                        resource
                    );
                if (fs.existsSync(abs)) {
                    const content = fs.readFileSync(abs, "utf8");
                    if (exportStarRe.test(content)) {
                        throw unsupportedWildcardError(`Module: ${abs}`);
                    }
                }
            }

            const exportsInfo =
                compilation.moduleGraph.getExportsInfo(module);
            const other = exportsInfo.otherExportsInfo;

            if (other && other.provided === true) {
                throw unsupportedWildcardError(
                    `Module: ${resource ?? "<synthetic>"}`
                );
            }
        }
    }
}

function unsupportedWildcardError(details?: string): Error {
    return new Error(
        [
            "Unsupported wildcard re-export detected.",
            "",
            "This build uses a wildcard re-export (`export *` or `export * as ns`), which cannot be safely",
            "flattened into a Google Apps Script global namespace.",
            "",
            "Workaround:",
            "Replace wildcard re-exports with explicit named re-exports:",
            '  export { foo, bar } from "./module";',
            "",
            details ?? ""
        ].join("\n")
    );
}
