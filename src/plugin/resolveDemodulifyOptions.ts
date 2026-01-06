import { DemodulifyOptionsSchema, GASDemodulifyOptions } from "./options.schema";

/**
 * Parse, validate, and default user-supplied plugin options.
 *
 * This is intentionally separate from the constructor so it can be unit tested
 * without invoking Webpack.
 */
export function resolveDemodulifyOptions(
    input?: unknown
): GASDemodulifyOptions {
    // If caller passes nothing, we still want schema defaults to apply.
    return DemodulifyOptionsSchema.parse(input ?? {});
}
