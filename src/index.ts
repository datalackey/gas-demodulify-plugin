/**
 * Package entrypoint and CommonJS compatibility boundary.
 *
 * This file defines the *public API surface* of the package.
 * It intentionally exports exactly one value for Webpack users: the gas-demodulify-plugin plugin constructor.
 *
 * Why this exists:
 * - The package is effectively published as CommonJS due to a combination of factors:
 *
 *   1) TypeScript compilation target:
 *      - `tsconfig.json` specifies `"module": "commonjs"`,
 *        which determines the emitted JavaScript semantics
 *        (`module.exports`, `require()`).
 *
 *   2) Package entrypoint declaration:
 *      - `package.json` exposes `dist/index.js` via the `main` field,
 *        defining how Node and bundlers load the package.
 *
 *   3) Node module interpretation rules:
 *      - The absence of `"type": "module"` in `package.json` causes Node
 *        to interpret `.js` files as CommonJS by default.
 *
 *   Together, these establish a CommonJS contract for consumers.
 *
 * Consumer expectations:
 * - Webpack plugins are typically consumed via `require("package-name")` -- not ESM `import` syntax.
 * - Consumers expect that call to return the constructor itself,
 *   not a `{ default: ... }` wrapper or a namespace object.
 *
 * Implementation details:
 * - Uses TypeScript `export =` syntax so the compiled output is:
 *     `module.exports = PluginConstructor`
 * - Users of plugin use `require()` import style intentionally to preserve CommonJS semantics.
 *
 * Note on linting:
 * - `require()` usage in this file is deliberate and confined to this
 *   package boundary.
 * - ESLint rules discouraging `require()` are intended for application code,
 *   not for package entrypoint shims.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import GASDemodulifyPlugin = require("./plugin/GASDemodulifyPlugin");
export = GASDemodulifyPlugin;

