/**
 * GAS demodulification invariants.
 *
 * These strings must NEVER appear in emitted GAS output.
 * Their presence indicates leaked Webpack runtime artifacts.
 */
export const FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS = [
    "__webpack_",     // any webpack runtime helper leaking is BAD !
    ".__esModule"     // ES module interop artifact appearing in GAS is BAD !
] as const;

