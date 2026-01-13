/**
 * GAS demodulification invariants.
 *
 * These patterns must NEVER appear in emitted GAS output.
 * Their presence indicates leaked Webpack / module-system artifacts.
 *
 * IMPORTANT:
 *  - These are UNANCHORED patterns by design.
 *  - We must detect violations anywhere in the output, regardless of formatting.
 *  - Might flag false positives in string literals or comments, but that's acceptable
 *    since such cases are likely to be rare and indicative of potential issues anyway.
 */
export const FORBIDDEN_WEBPACK_RUNTIME_PATTERNS: readonly RegExp[] = [
    /__webpack_/i,                         // any webpack runtime helper
    /\.__esModule\b/i,                     // ESM interop artifact
    /\bexports\./i,                        // CommonJS named export
    /\bmodule\.exports\b/i,                // CommonJS default export
    /Object\.defineProperty\s*\(\s*exports\b/i // CJS export descriptor
] as const;
