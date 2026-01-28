import { Module, Compilation } from "webpack";

/**
 * Contains types that are SHARED ACROSS MODULES in the plugin code base.
 *
 * Types and interfaces that are only referenced within a single module should be defined at the top
 * ofthat module.
 */

/**
 * Configuration options supplied to the code emitter.
 */
export type EmitterOpts = {
    namespaceRoot: string;
    subsystem: string;
    defaultExportName?: string;
    logLevel?: string;
};

/**
 * Describes a single exported symbol binding.
 */
export type ExportBinding = {
    exportName: string;
    localName: string;
    // The original webpack export name used to resolve defining modules ("default" or a named export)
    webpackExportName: string;
};

/**
 * Internal runtime specification used by this project.
 *
 * Represents the runtime name(s) a module’s generated code applies to.
 *
 * Conceptually corresponds to Webpack’s internal `RuntimeSpec` type
 * (which is not publicly exported), but intentionally models *membership only*.
 * Ordering guarantees required by Webpack are handled at the integration boundary.
 *
 * See:
 * https://github.com/datalackey/gas-demodulify-plugin/blob/main/docs/plugin-design.md#rationale-for-referencing-webpacks-internal-runtimespec
 */
export type RuntimeSpec = string | Set<string> | undefined;

/**
 * Describes the resolved TypeScript entrypoint selected for demodulification.
 */
export type ResolvedEntrypoint = {
    entryName: string;
    entryModule: Module;
    runtime: RuntimeSpec;
    chunks: any[];
};
