/**
 * GAS demodulification invariants.
 *
 * These strings must NEVER appear in emitted GAS output.
 * Their presence indicates leaked Webpack runtime artifacts.
 */
export const FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS = [
  "__webpack_require__",
  "__webpack_exports__",
  "__webpack_module__",
  "__webpack_modules__",
  "__webpack_runtime__",
] as const;

