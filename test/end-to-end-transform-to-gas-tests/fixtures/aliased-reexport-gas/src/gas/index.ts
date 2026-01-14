/**
 * Aliased re-export WITH anchoring side effect.
 *
 * Side-effect import forces Webpack to emit triggers.ts
 * Alias tests exportName vs webpackExportName handling.
 */

// Anchor defining module to avoid tree-shaking
//
import "./triggers";


export { onOpen as handleOpen } from "./triggers";
