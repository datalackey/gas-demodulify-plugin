// File: src/plugin/code-emission/CodeEmitter.ts

import type { Compilation, Module } from "webpack";
import { sources } from "webpack";
import dedent from "ts-dedent";
import strip from "strip-comments";

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

// Sentinel filename used in fixtures and to mark transient Webpack bundle assets.
export const OUTPUT_BUNDLE_FILENAME_TO_DELETE =
    "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME";

/**
 * IMPORTANT LIMITATION (ENFORCED):
 *
 * Aliased re-exports such as:
 *
 *   export { onOpen as handleOpen } from "./triggers";
 *
 * do NOT create a runtime identifier named `handleOpen`.
 *
 * Webpack collapses alias information before this plugin runs,
 * making it impossible to safely bind such exports without parsing
 * TypeScript source directly.
 *
 * Therefore:
 *   ❌ This construct is NOT supported
 *   ✅ We FAIL FAST with a clear error
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

        assertNoWildcardReexports(compilation, entry);
        Logger.info("Validated export surface (no wildcard re-exports)");

        const exportBindings = getExportBindings(
            compilation,
            entry.entryModule,
            entry.runtime,
            opts
        );

        Logger.info(`Discovered ${exportBindings.length} exported symbol(s)`);

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
        Logger.info("Sanitized transpiled module source");

        const output = getGasSafeOutput(
            namespace,
            sanitizedSource,
            exportBindings
        );
        Logger.info("Assembled GAS-safe output");

        cleanupUnwantedOutputFiles(compilation);
        Logger.info("Removed transient Webpack JavaScript artifacts");

        const outputName = `${entry.entryName}.gs`;

        warnIfWebpackRuntimeLeaked(
            output,
            `${opts.namespaceRoot}.${opts.subsystem}`
        );

        compilation.emitAsset(
            outputName,
            new sources.RawSource(output)
        );

        Logger.info(`Emitted GAS artifact '${outputName}'`);
    };
}

// ======================================================
// Export surface resolution (FAIL-FAST for alias re-exports)
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

        // -------------------------
        // DEFAULT EXPORT
        // -------------------------
        if (exportInfo.name === "default") {
            const gasName =
                opts.defaultExportName ?? "defaultExport";

            bindings.push({
                exportName: gasName,
                localName: "defaultExport",
                webpackExportName: "default"
            });
            continue;
        }

        const target = (exportInfo as any).getTarget?.(
            compilation.moduleGraph,
            runtime
        );

        const isReexport =
            target?.module && target.module !== entryModule;

        let definingHasLocalBinding = false;

        if (isReexport && target?.module) {
            const definingExports =
                compilation.moduleGraph.getExportsInfo(target.module);

            for (const e of definingExports.orderedExports) {
                if (e.name === exportInfo.name) {
                    definingHasLocalBinding = true;
                    break;
                }
            }
        }

        // 🚨 UNSUPPORTED CONSTRUCT — THROW
        if (isReexport && !definingHasLocalBinding) {
            throw new Error(
                [
                    `Unsupported aliased re-export detected for '${exportInfo.name}'.`,
                    ``,
                    `This export is re-exported from another module but does NOT`,
                    `correspond to a real runtime identifier.`,
                    ``,
                    `Problematic pattern:`,
                    `  export { onOpen as ${exportInfo.name} } from "./triggers";`,
                    ``,
                    `Why this fails:`,
                    `  - Re-exports do not create runtime bindings`,
                    `  - GAS requires real top-level functions`,
                    ``,
                    `Fix (recommended):`,
                    `  import { onOpen } from "./triggers";`,
                    `  export function ${exportInfo.name}() { return onOpen(); }`
                ].join("\n")
            );
        }

        bindings.push({
            exportName: exportInfo.name,
            localName: exportInfo.name,
            webpackExportName: exportInfo.name
        });

        Logger.debug(
            `ExportBinding resolved: ` +
            `exportName=${exportInfo.name} runtimeIdentifier=${exportInfo.name}`
        );
    }

    return bindings;
}

// ======================================================
// Output helpers
// ======================================================

function getGasSafeOutput(
    namespace: string,
    moduleSource: string,
    exports: ExportBinding[]
) {
    const exportAssignments = exports
        .map(
            e =>
                `globalThis.${namespace}.${e.exportName} = ${e.localName};`
        )
        .join("\n");

    return dedent`
        ${renderNamespaceInit(namespace)}

        // Module code (transpiled)
        ${moduleSource}

        // Export surface
        ${exportAssignments}
    `;
}

function getModuleSource(
    compilation: Compilation,
    module: Module,
    runtime: any
): string {
    const results = (compilation as any).codeGenerationResults;
    if (!results) return "";

    const codeGen = results.get(module, runtime);
    if (!codeGen) return "";

    const sourcesMap = (codeGen as any).sources;
    const source =
        sourcesMap?.get("javascript") ?? sourcesMap?.get("js");

    return source?.source?.()
        ? String(source.source())
        : "";
}

function getCombinedModuleSource(
    compilation: Compilation,
    modules: Module[],
    runtime: any
): string {
    const parts: string[] = [];

    for (const m of modules) {
        const src = getModuleSource(compilation, m, runtime);
        if (src && src.trim()) {
            parts.push(src);
        }
    }

    return parts.join("\n");
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

    for (const e of exports) {
        const defining = resolveExportDefiningModule(
            compilation,
            entry.entryModule,
            e.webpackExportName
        );
        set.add(defining);
    }

    return Array.from(set);
}

function resolveExportDefiningModule(
    compilation: Compilation,
    entryModule: Module,
    exportName: string
): Module {
    const exportsInfo =
        compilation.moduleGraph.getExportsInfo(entryModule);

    const exportInfo: any =
        (exportsInfo as any).getExportInfo(exportName);

    const target = exportInfo?.getTarget?.(
        compilation.moduleGraph
    );

    if (target?.module) {
        return target.module as Module;
    }

    return entryModule;
}

function sanitizeWebpackHelpers(source: string): string {
    if (!source.trim()) return source;

    const lines = source.split(/\r?\n/);
    const out: string[] = [];

    for (const line of lines) {
        const violated =
            FORBIDDEN_WEBPACK_RUNTIME_PATTERNS.some(re =>
                re.test(line)
            );

        if (violated) {
            out.push(
                `// [dropped-by-gas-demodulify]: ${line.trim()}`
            );
        } else {
            out.push(line);
        }
    }

    return out.join("\n");
}

function warnIfWebpackRuntimeLeaked(
    output: string,
    context: string
) {
    const uncommented = strip(output);

    for (const re of FORBIDDEN_WEBPACK_RUNTIME_PATTERNS) {
        if (re.test(uncommented)) {
            Logger.error(
                `Internal invariant violated: forbidden Webpack artifact ` +
                `'${re}' detected in emitted GAS output (${context}).`
            );
            return;
        }
    }
}

function renderNamespaceInit(namespace: string): string {
    return dedent`
        // Namespace initialization
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
        if (assetName.endsWith(".js")) {
            compilation.deleteAsset(assetName);
            continue;
        }

        if (assetName === OUTPUT_BUNDLE_FILENAME_TO_DELETE) {
            compilation.deleteAsset(assetName);
        }
    }
}
