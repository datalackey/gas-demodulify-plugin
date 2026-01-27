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
 * Webpack RuntimeSpec (not exported publicly by webpack).
 *
 * Represents the runtime name(s) a module is generated for.
 *
 * Mirrors Webpack's internal RuntimeSpec type.
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
