import type { Module, Compilation } from "webpack";

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
 * Describes the resolved TypeScript entrypoint selected for demodulification.
 */
export type ResolvedEntrypoint = {
    entryName: string;
    entryModule: Module;
    runtime: any;
    chunks: any[];
};

export type WebpackCompilation = Compilation;
