import { z } from "zod";

/**
 * Public configuration options for GASDemodulifyPlugin.
 *
 * These options are supplied by the consumer when constructing the plugin
 * instance in `webpack.config.js`.
 *
 * They control:
 *  - how emitted symbols are namespaced
 *  - which logical subsystem is being built
 *  - which artifacts are emitted
 *  - how much diagnostic output is produced
 *
 * This schema is the single source of truth for:
 *  - runtime validation
 *  - defaulting behavior
 *  - TypeScript type inference
 */
export const DemodulifyOptionsSchema = z.object({
    /**
     * The root global namespace under which all generated symbols are attached.
     *
     * Example:
     *   namespaceRoot: "MYADDON"
     *
     * This value becomes the first segment of every emitted namespace path.
     */
    namespaceRoot: z
        .string()
        .min(1, "namespaceRoot must be a non-empty string")
        .default("DEFAULT"),

    /**
     * Logical subsystem name.
     *
     * Examples:
     *  - "GAS"
     *  - "UI"
     *  - "COMMON"
     *
     * Combined with `namespaceRoot`, this produces the final namespace
     * used for symbol attachment (e.g. "DEFAULT.GAS").
     */
    subsystem: z
        .string()
        .min(1, "subsystem must be a non-empty string")
        .default("DEFAULT"),

    /**
     * Controls which artifacts are emitted by the plugin.
     *
     *  - "gas"    → emit `.gs` only
     *  - "ui"     → emit `.html` only
     *  - "common" → emit both `.gs` and `.html`
     *
     * NOTE:
     * The current implementation wires this option through the plugin API,
     * but artifact branching logic is handled elsewhere.
     */
    buildMode: z
        .enum(["gas", "ui", "common"])
        .default("gas"),

    /**
     * Optional logging verbosity.
     *
     *  - "silent" → no output
     *  - "info"   → high-level lifecycle messages
     *  - "debug"  → detailed internal diagnostics
     *
     * If omitted, logging defaults to "info".
     */
    logLevel: z
        .enum(["silent", "info", "debug"])
        .default("info"),
});

/**
 * Fully-resolved, runtime-valid plugin options.
 *
 * Notes:
 *  - All fields are guaranteed to be present
 *  - Defaults have already been applied
 *  - This type should be used internally by the plugin
 */
export type GASDemodulifyOptions =
    z.infer<typeof DemodulifyOptionsSchema>;
