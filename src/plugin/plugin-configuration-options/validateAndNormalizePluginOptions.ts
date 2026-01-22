import { DemodulifyOptionsSchema, GASDemodulifyOptions } from "./options.schema";

/**
 * Parse, validate, and normalize (i.e., apply defaults where field is missing) the user-supplied plugin options.
 */
export function validateAndNormalizePluginOptions(input?: unknown): GASDemodulifyOptions {
    // If caller passes nothing, we still want schema defaults to apply.
    return DemodulifyOptionsSchema.parse(input ?? {});
}
