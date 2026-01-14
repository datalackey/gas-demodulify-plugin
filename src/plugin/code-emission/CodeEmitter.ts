// File: src/plugin/code-emission/CodeEmitter.ts

import type { Compilation, Module } from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
import strip from "strip-comments";
import fs from "fs";

import { Logger } from "../Logger";
import { FORBIDDEN_WEBPACK_RUNTIME_PATTERNS } from "../invariants";
import type {
    EmitterOpts,
    ExportBinding,
    ResolvedEntrypoint
} from "./types";
import {
    resolveTsEntrypoint,
    assertNoWildcardReexports
} from "./resolvers";

export const OUTPUT_BUNDLE_FILENAME_TO_DELETE =
    "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME";

/**
 * ENFORCED LIMITATION:
 * -------------------
 * Aliased re-exports of imported symbols are NOT supported.
 *
 * Example (unsupported):
 *   export { onOpen as handleOpen } from "./triggers";
 *
 * Reason:
 * - Re-exports do not create runtime identifiers
 * - Webpack erases alias intent before this plugin runs
 * - GAS requires real top-level bindings
 *
 * Therefore we FAIL FAST when this syntax is detected.
 */
export function getEmitterFunc(
    compilation: Compilation,
    opts: EmitterOpts
) {
    return () => {
        Logger.debug("Entered processAssets hook");

        const namespace = `${opts.namespaceRoot}.${opts.subsystem}`;
        Logger.info(`Beginning demodulification for namespace '${namespace}'`);

        const entry = resolveTsEntrypoint(compilation);
        Logger.info(`Resolved TypeScript entrypoint '${entry.entryName}'`);

        // 🚨 HARD FAIL: detect unsupported re-export syntax
        assertNoAliasedReexportsInEntry(entry.entryModule);

        assertNoWildcardReexports(compilation, entry);
        Logger.info("Validated export surface");

        const exportBindings = getExportBindings(
            compilation,
            entry.entryModule,
            entry.runtime,
            opts
        );

        if (exportBindings.length === 0) {
            throw new Error("No exported symbols found in TypeScript entrypoint");
        }

        const modulesToEmit = collectModulesToEmit(
            compilation,
            entry,
            exportBindings
        );

        const rawSource = getCombinedModuleSource(
            compilation,
            modulesToEmit,
            entry.runtime
        );

        const sanitizedSource = sanitizeWebpackHelpers(rawSource);

        const output = getGasSafeOutput(
            namespace,
            sanitizedSource,
            exportBindings
        );

        cleanupUnwantedOutputFiles(compilation);

        compilation.emitAsset(
            `${entry.entryName}.gs`,
            new sources.RawSource(output)
        );
    };
}

// ======================================================
// 🚨 NEW: Regex-based guard (authoritative)
// ======================================================

function assertNoAliasedReexportsInEntry(entryModule: Module) {
    const resource = (entryModule as any)?.resource;
    if (typeof resource !== "string") return;

    const source = fs.readFileSync(resource, "utf8");

    // Matches: export { foo as bar } from "./x";
    const ALIASED_REEXPORT_RE =
        /export\s*\{[^}]*\bas\b[^}]*\}\s*from\s*['"][^'"]+['"]/g;

    if (ALIASED_REEXPORT_RE.test(source)) {
        throw new Error(
            [
                `Unsupported aliased re-export detected in entry module.`,
                ``,
                `This plugin does not support:`,
                `  export { foo as bar } from "...";`,
                ``,
                `Reason:`,
                `  - Re-exports do not create runtime identifiers`,
                `  - Webpack removes alias information`,
                `  - GAS requires real top-level functions`,
                ``,
                `Fix:`,
                `  import { foo } from "...";`,
                `  export function bar() { return foo(); }`
            ].join("\n")
        );
    }
}

// ======================================================
// Export surface resolution (safe cases only)
// ======================================================

function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
    runtime: any,
    opts: EmitterOpts
): ExportBinding[] {
    const bindings: ExportBinding[] = [];
    const exportsInfo =
        compilation.moduleGraph.getExportsInfo(entryModule);

    for (const exportInfo of exportsInfo.orderedExports) {
        if (exportInfo.name === "__esModule") continue;

        if (exportInfo.name === "default") {
            bindings.push({
                exportName: opts.defaultExportName ?? "defaultExport",
                localName: "defaultExport",
                webpackExportName: "default"
            });
            continue;
        }

        bindings.push({
            exportName: exportInfo.name,
            localName: exportInfo.name,
            webpackExportName: exportInfo.name
        });
    }

    return bindings;
}

// ======================================================
// Helpers (unchanged)
// ======================================================

function getGasSafeOutput(
    namespace: string,
    moduleSource: string,
    exports: ExportBinding[]
) {
    return dedent`
        ${renderNamespaceInit(namespace)}

        ${moduleSource}

        ${exports
        .map(
            e =>
                `globalThis.${namespace}.${e.exportName} = ${e.localName};`
        )
        .join("\n")}
    `;
}

function getModuleSource(
    compilation: Compilation,
    module: Module,
    runtime: any
): string {
    const results = (compilation as any).codeGenerationResults;
    const codeGen = results?.get(module, runtime);
    const source =
        codeGen?.sources?.get("javascript") ??
        codeGen?.sources?.get("js");

    return source?.source?.() ? String(source.source()) : "";
}

function getCombinedModuleSource(
    compilation: Compilation,
    modules: Module[],
    runtime: any
): string {
    return modules
        .map(m => getModuleSource(compilation, m, runtime))
        .filter(Boolean)
        .join("\n");
}

function collectModulesToEmit(
    compilation: Compilation,
    entry: ResolvedEntrypoint,
    exports: ExportBinding[]
): Module[] {
    const set = new Set<Module>();

    set.add(entry.entryModule);

    for (const chunk of entry.chunks) {
        for (const m of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
            set.add(m);
        }
    }

    return Array.from(set);
}

function sanitizeWebpackHelpers(source: string): string {
    return source
        .split(/\r?\n/)
        .map(line =>
            FORBIDDEN_WEBPACK_RUNTIME_PATTERNS.some(re => re.test(line))
                ? `// [dropped-by-gas-demodulify]: ${line.trim()}`
                : line
        )
        .join("\n");
}

function renderNamespaceInit(namespace: string): string {
    return dedent`
        (function init(ns) {
          let o = globalThis;
          for (const p of ns.split(".")) {
            o[p] = o[p] || {};
            o = o[p];
          }
        })("${namespace}");
    `;
}

function cleanupUnwantedOutputFiles(
    compilation: Compilation
) {
    for (const assetName of Object.keys(compilation.assets)) {
        if (assetName.endsWith(".js") ||
            assetName === OUTPUT_BUNDLE_FILENAME_TO_DELETE) {
            compilation.deleteAsset(assetName);
        }
    }
}
