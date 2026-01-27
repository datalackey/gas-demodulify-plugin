// File: src/plugin/code-emission/CodeEmitter.ts

import type { Module } from "webpack";
import type { Compilation } from "webpack";
import { sources } from "webpack";

type WebpackRuntimeSpec = Parameters<import("webpack").CodeGenerationResults["get"]>[1];

import type { RuntimeSpec } from "./types";
import type { EmitterOpts } from "./types";
import type { ExportBinding } from "./types";
import type { ResolvedEntrypoint } from "./types";

import dedent from "ts-dedent";
import fs from "fs";

import { Logger } from "../Logger";
import { FORBIDDEN_WEBPACK_RUNTIME_PATTERNS } from "../invariants";

import { resolveTsEntrypoint } from "./wildcards-resolution-helpers";
import { assertNoWildcardReexports } from "./wildcards-resolution-helpers";

export const OUTPUT_BUNDLE_FILENAME_TO_DELETE = "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME";

interface CompilationWithCodeGen extends Compilation {
    // Define what we need from this web pack internal only type
    codeGenerationResults?: import("webpack").CodeGenerationResults;
}

/**
 * ENFORCED ENTRY MODULE RESTRICTIONS
 * ---------------------------------
 *
 * ❌ Aliased re-exports are NOT supported:
 *     export { foo as bar } from "./mod";
 *
 * ✅ Non-aliased re-exports ARE supported:
 *     export { foo } from "./mod";
 */
export function getEmitterFunc(compilation: Compilation, opts: EmitterOpts): () => void {
    return () => {
        Logger.debug("Entered processAssets hook");

        const namespace = `${opts.namespaceRoot}.${opts.subsystem}`;
        Logger.info(`Beginning demodulification for namespace '${namespace}'`);

        const entry = resolveTsEntrypoint(compilation);
        Logger.info(`Resolved TypeScript entrypoint '${entry.entryName}'`);

        // 🚨 HARD FAIL: aliased re-exports only
        assertNoAliasedReexportsInEntry(entry.entryModule);

        assertNoWildcardReexports(compilation, entry);
        Logger.info("Validated export surface");

        const exportBindings = getExportBindings(compilation, entry.entryModule, opts);

        if (exportBindings.length === 0) {
            throwEmitError("No exported symbols found in TypeScript entrypoint.");
        }

        const modulesToEmit = collectModulesToEmit(compilation, entry);

        const rawSource = getCombinedModuleSource(compilation, modulesToEmit, entry.runtime);
        assertAllExportsHaveRuntimeDefinitions(exportBindings, rawSource);

        const sanitizedSource = sanitizeWebpackHelpers(rawSource);

        const output = getGasSafeOutput(namespace, sanitizedSource, exportBindings);

        cleanupUnwantedOutputFiles(compilation);

        compilation.emitAsset(`${entry.entryName}.gs`, new sources.RawSource(output));
    };
}

// ======================================================
// Canonical error helper
// ======================================================

function throwEmitError(detail: string): never {
    throw new Error(`gas-demodulify: Unable to emit code for module.\n${detail}`);
}

// ======================================================
// 🚨 Aliased re-export guard (ONLY unsafe case)
// ======================================================

function assertNoAliasedReexportsInEntry(entryModule: Module): void {
    // Avoid `any` by treating the module as an unknown shape and checking for `resource` safely
    const maybeWithResource = entryModule as unknown as { resource?: unknown };
    const resource = maybeWithResource.resource;
    if (typeof resource !== "string") return;

    const source = fs.readFileSync(resource, "utf8");

    const ALIASED_REEXPORT_RE = /export\s*\{[^}]*\bas\b[^}]*\}\s*from\s*['"][^'"]+['"]/;

    if (ALIASED_REEXPORT_RE.test(source)) {
        throwEmitError(
            "Unsupported aliased re-export detected in entry module.\n" +
                "Aliased re-exports do not create runtime identifiers in GAS.\n" +
                "Define a local wrapper function instead."
        );
    }
}

// ======================================================
// Export surface resolution
// ======================================================

function getExportBindings(
    compilation: Compilation,
    entryModule: Module,
    opts: EmitterOpts
): ExportBinding[] {
    const bindings: ExportBinding[] = [];
    const exportsInfo = compilation.moduleGraph.getExportsInfo(entryModule);

    for (const exportInfo of exportsInfo.orderedExports) {
        if (exportInfo.name === "__esModule") continue;

        if (exportInfo.name === "default") {
            bindings.push({
                exportName: opts.defaultExportName ?? "defaultExport",
                localName: "defaultExport",
                webpackExportName: "default",
            });
            continue;
        }

        bindings.push({
            exportName: exportInfo.name,
            localName: exportInfo.name,
            webpackExportName: exportInfo.name,
        });
    }

    return bindings;
}

// ======================================================
// Helpers
// ======================================================

function getGasSafeOutput(
    namespace: string,
    moduleSource: string,
    exports: ExportBinding[]
): string {
    return dedent`
        ${renderNamespaceInit(namespace)}

        ${moduleSource}

        ${exports.map(e => `globalThis.${namespace}.${e.exportName} = ${e.localName};`).join("\n")}
    `;
}

function renderRuntime(runtime: RuntimeSpec): string {
    if (runtime === undefined) return "<default>";
    if (typeof runtime === "string") return runtime;
    return `{${[...runtime].join(",")}}`;
}

function describeValue(value: unknown): string {
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    // Don't think about extracting out 'type of value' into variable: es-lint will punish you for it
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return String(value);
    if (typeof value === "bigint") return String(value);
    if (typeof value === "symbol") return String(value);
    if (typeof value === "function") return "[Function]";

    if (typeof value === "object" && value !== null && value instanceof Set) {
        const parts = Array.from(value.values()).map(v => describeValue(v));
        return `Set(${parts.length}){${parts.join(",")}}`;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return Object.prototype.toString.call(value);
    }
}

function assertChunk(maybeChunk: unknown): asserts maybeChunk is import("webpack").Chunk {
    if (typeof maybeChunk !== "object" || maybeChunk === null) {
        throw new Error(`Invalid Webpack chunk: ${describeValue(maybeChunk)}`);
    }

    // We avoid deep structural assumptions. We just require an identifier-like field.
    const maybeChunkObj = maybeChunk as { id?: unknown; name?: unknown };
    if (maybeChunkObj.id === undefined && maybeChunkObj.name === undefined) {
        throw new Error(`Invalid Webpack chunk: ${describeValue(maybeChunk)}`);
    }
}

function getModuleSource(compilation: Compilation, module: Module, runtime: RuntimeSpec): string {
    const { codeGenerationResults } = compilation as CompilationWithCodeGen;
    if (codeGenerationResults === undefined) {
        Logger.debug("codeGenerationResults not available; skipping module source emission");
        return "";
    }

    const codeGen = codeGenerationResults.get(module, runtime as WebpackRuntimeSpec);
    if (codeGen === undefined) {
        Logger.warn(
            `No code generation result for module ${module.identifier()} and runtime ${renderRuntime(runtime)}`
        );
        return "";
    }

    const source = codeGen.sources?.get("javascript") ?? codeGen.sources?.get("js");
    if (source === undefined) {
        Logger.debug(`No JavaScript source emitted for module ${module.identifier()}`);
        return "";
    }

    if (typeof source.source !== "function") {
        Logger.debug(
            `No JavaScript source emitted for module ${module.identifier()} source() not a function`
        );
        return "";
    }

    const content = source.source();
    if (content === undefined || content === null) {
        return "";
    }

    return String(content);
}

function getCombinedModuleSource(
    compilation: Compilation,
    modules: Module[],
    runtime: unknown
): string {
    assertRuntimeSpec(runtime);

    return modules
        .map(m => getModuleSource(compilation, m, runtime))
        .filter(s => s.length > 0)
        .join("\n");
}

function assertRuntimeSpec(maybeRuntimeSpec: unknown): asserts maybeRuntimeSpec is RuntimeSpec {
    if (
        typeof maybeRuntimeSpec === "string" ||
        maybeRuntimeSpec === undefined ||
        (maybeRuntimeSpec instanceof Set && [...maybeRuntimeSpec].every(v => typeof v === "string"))
    ) {
        return;
    }

    throw new Error(`Invalid Webpack runtime: ${describeValue(maybeRuntimeSpec)}`);
}

function collectModulesToEmit(compilation: Compilation, entry: ResolvedEntrypoint): Module[] {
    const set = new Set<Module>();

    set.add(entry.entryModule);

    for (const chunk of entry.chunks) {
        assertChunk(chunk);

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

function cleanupUnwantedOutputFiles(compilation: Compilation): void {
    for (const assetName of Object.keys(compilation.assets)) {
        if (assetName.endsWith(".js") || assetName === OUTPUT_BUNDLE_FILENAME_TO_DELETE) {
            compilation.deleteAsset(assetName);
        }
    }
}

function assertAllExportsHaveRuntimeDefinitions(exports: ExportBinding[], source: string): void {
    for (const exp of exports) {
        if (exp.webpackExportName === "default") {
            continue;
        }

        const name = exp.localName;

        const hasFunction = new RegExp(`function\\s+${name}\\s*\\(`).test(source);
        const hasClass = new RegExp(`class\\s+${name}\\b`).test(source);
        const hasConst = new RegExp(`(?:const|let|var)\\s+${name}\\b`).test(source);

        if (!hasFunction && !hasClass && !hasConst) {
            throwEmitError(
                `Exported symbol '${name}' has no runtime definition.\n` +
                    `This usually means the symbol was re-exported without anchoring its defining module.\n\n` +
                    `Fix:\n` +
                    `  import "./<defining-module>";\n` +
                    `or define the function directly in the entry module.`
            );
        }
    }
}
