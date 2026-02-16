# gas-demodulify-plugin

## sadfu
## Table of Contents

<!-- TOC:START -->
- [gas-demodulify-plugin](#gas-demodulify-plugin)
  - [sadfu](#sadfu)
  - [Table of Contents](#table-of-contents)
  - [Plugin Overview](#plugin-overview)
  - [Support for Modern Architectures Comprised of Subsystems](#support-for-modern-architectures-comprised-of-subsystems)
    - [UI subsystem](#ui-subsystem)
    - [Backend (GAS) subsystem](#backend-gas-subsystem)
    - [Common subsystem](#common-subsystem)
    - [Example](#example)
    - [Backend subsystem (`gas/`)](#backend-subsystem-gas)
    - [Common subsystem (`common/`)](#common-subsystem-common)
    - [UI subsystem (`ui/`)](#ui-subsystem-ui)
  - [What the Plugin Generates](#what-the-plugin-generates)
    - [1. Backend bundle (`backend.gs`)](#1-backend-bundle-backendgs)
    - [2. Common subsystem bundles](#2-common-subsystem-bundles)
      - [COMMON for backend (`common.gs`)](#common-for-backend-commongs)
      - [COMMON for UI (`common.html`)](#common-for-ui-commonhtml)
    - [3. UI bundle (`ui.html`)](#3-ui-bundle-uihtml)
  - [Finer Points Regarding How Code Must Be Bundled for GAS](#finer-points-regarding-how-code-must-be-bundled-for-gas)
    - [Why should client-side browser code be processed with Webpack at all?](#why-should-client-side-browser-code-be-processed-with-webpack-at-all)
    - [How Load Order Can Be Leveraged to Manage Inter-Subsystem Dependencies -- OBSOLETE](#how-load-order-can-be-leveraged-to-manage-inter-subsystem-dependencies----obsolete)
      - [GAS Load Order Constraints](#gas-load-order-constraints)
  - [Restrictions](#restrictions)
  - [Configuration](#configuration)
    - [General Options](#general-options)
      - [module.exports.entry](#moduleexportsentry)
    - [Plugin Constructor Options](#plugin-constructor-options)
      - [*namespaceRoot*](#namespaceroot)
      - [*subsystem*](#subsystem)
      - [*buildMode*](#buildmode)
      - [*defaultExportName*](#defaultexportname)
          - [Example](#example-1)
    - [Log level](#log-level)
  - [Of Interest to Contributors](#of-interest-to-contributors)
<!-- TOC:END -->

## Plugin Overview

A Webpack plugin that flattens modular TypeScript codebases into
[Google Apps Script](https://workspace.google.com/products/apps-script/) (GAS)-safe
JavaScript with clean **hierarchical
namespaces** corresponding to the top-level subsystems of a complex [GAS
add-on extension](https://developers.google.com/apps-script/guides/sheets).
This plugin was originally intended to serve as the core of an opinionated build
system for such extensions. Most existing Webpack-based tooling and GAS starter repos deal with
simple codebases and flat scripts, but fail when applied to more
complex architectures.

So, if your (Typescript) code base

- has multiple subsystems, and
- you want your emitted GAS code to isolate code for each subsystem into its own namespace, and
- you are horrified at the prospect of using brittle search and replace on strings to post-modify webpack output

then this plugin is for you.

When generating code `gas-demodulify` completely discards Webpack’s emitted runtime artifacts
— including the __webpack_require__
mechanism and its wrapping [IIFE](https://developer.mozilla.org/en-US/docs/Glossary/IIFE).
Instead, it generates fresh, GAS-safe JavaScript
compatible with both the GAS runtime and
the [HtmlService](https://developers.google.com/apps-script/reference/html/html-service)
delivery model using:

- user supplied namespace configuration metadata
- transpiled module sources provided by Webpack’s compilation pipeline
  (after module dependency resolution and type-checking, but before runtime execution)

Caveat: Our plugin disallows certain patterns and configurations -- in both source code and Webpack config --
that produce invalid GAS code. See the [Restrictions](#restrictions) section for details.

## Support for Modern Architectures Comprised of Subsystems

A modern architecture for a complex GAS add-on typically comprises subsystems, with a common organization
breaking down into: **ui**, **backend (gas)**, and **common**. We will describe the operation of the plugin assuming
this tri-layer organization, but the plugin can be adapted to other architectures as well,
as discussed in the configuration section, below.

### UI subsystem

The UI subsystem typically consists of:

- HTMLService dialogs &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; # (not typically bundled, but pushed 'raw' by clasp)
- Sidebar interfaces &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; # (not typically bundled, but pushed 'raw' by clasp)
- svg images for icons &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; # (not typically bundled, but pushed 'raw' by clasp)
- Client-side controller logic running in browser
- Multi-step orchestration flows unsuitable for pure GAS execution

### Backend (GAS) subsystem

This subsystem contains:

- Apps Script entrypoint functions invoked from the UI
- Spreadsheet/Drive API logic
- Custom menu handlers
- Trigger functions (`onOpen`, `onEdit`, ...)
- Business logic executed on Google’s servers

### Common subsystem

This subsystem hosts shared utility code that must exist in **both** UI and backend bundles:

- Logging support
- Data models
- Any reusable logic shared across UI and backend

This tri-layer architecture reflects the natural separation required by
Apps Script: `ui` code runs in a browser iframe, `backend` code runs in the
GAS runtime, and `common` code must be bundled twice. The double bundling of `common`  code
is necessary because we need to make common code available in two different generated code artifacts. One is to
be included in the HTML served to
the client via
[HtmlService.createHtmlOutputFromFile](https://developers.google.com/apps-script/reference/html/html-service#createHtmlOutputFromFile(String)),
and this requires the code live in a file with extension '.html'. The other is to
be included in the server-side GAS code, and thus must have extension '.gs'.

A normal Webpack build cannot satisfy the above requirements, as well as some of the more subtle
requirements discussed in [this section](#finer-points-regarding-how-code-must-be-bundled-for-gas)
.
Furthermore, Google Apps Script cannot:

- run Webpack's module runtime, `__webpack_require__`,
- nor its wrapping IIFE,
- nor resolve its internal module map.

Modern TypeScript/ESM code must therefore be **demodulified** — stripped of all the webpack require stuff,
and flattened into plain top-level functions.

**gas-demodulify** performs exactly this transformation.

------------------------------------------------------------------------

### Example

Suppose you are developing a Google Sheets add-on named **MyAddon**.

Assume your subsystems import export the following:

### Backend subsystem (`gas/`)

    import { Logger } from '../common/logger';

    export function getData() {
      Logger.log('getData called');
      return "backend-data";
    }

### Common subsystem (`common/`)

    export class Logger {
      static log(msg: string) {
        console.log(`LOG: ${msg}`);
      }
    }

### UI subsystem (`ui/`)

    import { Logger } from '../common/logger';

    export function startUiFlow() {
      Logger.log("UI flow started");
      google.script.run
        .withSuccessHandler(result => Logger.log(`Backend returned: ${result}`))
        .getData(); // must be invoked via google.script.run
    }

------------------------------------------------------------------------

## What the Plugin Generates

### 1. Backend bundle (`backend.gs`)

    // Namespace initialization
    (function init(ns) {
      let o = globalThis;
      for (const p of ns.split(".")) o = o[p] = o[p] || {};
    })("MYADDON.GAS");


    Logger = MYADDON.COMMON.Logger.

    // Flattened backend code
    function getData() {
      Logger.log("getData called");
      return "backend-data";
    }

    // Export surface
    globalThis.MYADDON.GAS.getData = getData;

### 2. Common subsystem bundles

The COMMON bundle is emitted **twice**, once for backend and once for
UI.

#### COMMON for backend (`common.gs`)

    (function init(ns) {
      let o = globalThis;
      for (const p of ns.split(".")) o = o[p] = o[p] || {};
    })("MYADDON.GAS");

    // Imported symbol bindings
    const Logger = MYADDON.COMMON.Logger;

    class Logger {
      static log(msg) {
        console.log(`LOG: ${msg}`);
      }
    }

    globalThis.MYADDON.GAS.Logger = Logger;

#### COMMON for UI (`common.html`)

    <script>
    // Namespace initialization
    (function init(ns) {
      let o = globalThis;
      for (const p of ns.split(".")) o = o[p] = o[p] || {};
    })("MYADDON.UI");

    class Logger {
      static log(msg) {
        console.log(`LOG: ${msg}`);
      }
    }

    globalThis.MYADDON.UI.Logger = Logger;
    </script>

### 3. UI bundle (`ui.html`)

    <script>
    // Namespace initialization
    (function init(ns) {
      let o = globalThis;
      for (const p of ns.split(".")) o = o[p] = o[p] || {};
    })("MYADDON.UI");

    // Import bindings
    const Logger = MYADDON.COMMON.Logger;

    // UI function that uses COMMON and calls backend
    function startUiFlow() {
      MYADDON.COMMON.Logger.log("UI flow started");
      google.script.run
        .withSuccessHandler(result =>
          MYADDON.COMMON.Logger.log(`Backend returned: ${result}`)
        )
        .getData();
    }

    // Export to namespace
    globalThis.MYADDON.UI.startUiFlow = startUiFlow;
    </script>

------------------------------------------------------------------------

## Finer Points Regarding How Code Must Be Bundled for GAS

### Why should client-side browser code be processed with Webpack at all?

Although the UI code of a GAS add-on ultimately executes inside your
browser (for example, within a dialog or sidebar iframe),
the browser never receives your JavaScript as a distinct chunk separate from the surrounding mark-up.
All UI code must be delivered through GAS's
[HtmlService](https://developers.google.com/apps-script/reference/html/html-service),
which expects you to load exactly one HTML file,
with all JavaScript imports resolved and all code inlined and delivered
together with the HTML markup as a single unit.

In a conventional web application, client-side JavaScript may be split
across many files and loaded dynamically by the browser using ES modules.
For example, HTML such as:

```html
<script type="module" src="./main.js"></script>
```

instructs the browser to treat main.js as an ES module entrypoint. The
browser will then issue an HTTP request such as:

```http
GET /main.js
```

and, as additional import statements are encountered, will issue further
requests for each referenced module. These requests are resolved by a web
server that exposes URL-addressable JavaScript resources (for example,
static files served from the application’s document root).

Google Apps Script does not provide such a delivery model. HtmlService emits
a single, generated HTML document and does not expose a web server capable
of responding to follow-on requests for JavaScript modules. As a result,
there are no URL-addressable resources corresponding to ./main.js (or any
other imported module), and ES module loading via

```html
<script type="module">
```

is fundamentally unsupported in GAS. Therefore, even though the
browser environment itself is fully capable of executing ES, GAS cannot deliver ES modules.
For this reason, all UI code must be bundled
into a single, flat `<script>` block, with all imports resolved ahead of
time, no import or export syntax remaining, and no Webpack runtime
present. Webpack, in conjunction with our plugin, performs this 'flattening'
and demodulification automatically.

### How Load Order Can Be Leveraged to Manage Inter-Subsystem Dependencies -- OBSOLETE

Most complex GAS add-ons begin with a tri-layer structure:

- `ui` (browser code)
- `gas` (backend server code)
- `common` (shared utilities)

But some grow to include additional layers, such as:

- `charts`
- `api`
- `models`
- `validation`
- `sheets`
- `forms`

Each of these may depend on others, and the load order of generated
`.gs` files becomes important.

#### GAS Load Order Constraints

Google Apps Script evaluates `.gs` files in **lexicographical
(alphabetical)** order at runtime. This ordering is not configurable. It
imposes the following rule:

> Any subsystem that provides shared utilities must be emitted
> **before** subsystems that depend on it.

Example: the backend (`GAS`) subsystem normally depends on `COMMON`.
Therefore:

- `COMMON` must appear **first** in `.gs` load order.
- `GAS` must appear **after COMMON**.

In older build systems, developers often handled this requirement using ad-hoc
post-processing scripts or manual renaming, commonly prefixing shared bundles
with names like `AAA_common.gs` to force correct load order.

Our plugin, together with standard webpack configuration options, eliminates
the need for such fragile post-processing by ensuring
that all generated bundles are clean, GAS-compatible artifacts whose load order
is determined entirely by standard Webpack configuration. In particular,
lexicographical load ordering is enforced by choosing appropriate values for
Webpack’s `output.filename`, allowing shared dependencies to sort before the
subsystems that depend on them. You still have to think about your inter-subsystem dependencies
and choose names accordingly, but you can handle this entirely via webpack configuration, with no
tedious post-processing required.

At a minimum: ensure that your `common` bundle is named
so that it sorts before any other `.gs` bundles that depend on it, using `output.filename`.
For example the configuration below would produce an output file named `00_common.[contenthash].gs`,
which sorts before `01_gas.[contenthash].gs` and `02_charts.[contenthash].gs` etc.

```javascript

    module.exports = {

       ....

      entry: {
        common: "./src/common/index.ts",
      }
        ...

      output: {
        filename: "00_[name].[contenthash].gs"
      }
```

------------------------------------------------------------------------

## Restrictions

This plugin enforces a small set of source-level and build-time restrictions.
Please design your code to avoid the following patterns; violations will
either be rejected by the plugin at build time or code you want to keep will be stripped (which may
cause hard-to-diagnose bugs that change runtime behavior).

- Forbidden Webpack runtime artifacts
    - Any substring matching the values in [FORBIDDEN_WEBPACK_RUNTIME_SUBSTRINGS](src/plugin/invariants.ts)
      is not allowed in emitted output. Currently, this includes:
        - `__webpack_` (any Webpack helper/runtime identifier)
        - `.__esModule` (ES module interop artifact)
    - Rationale: GAS cannot execute Webpack's module runtime (for example `__webpack_require__`) or interop boilerplate.
    - Fix: Remove direct references to Webpack internals from your source.

- No wildcard re-exports
    - Patterns rejected: `export * from './module'`, `export * as ns from './module'`, and bare `export *`.
    - Rationale: wildcard re-exports create a non-deterministic export surface which cannot be
      reliably flattened to a single GAS namespace.
    - Fix: Replace wildcard re-exports with explicit, named re-exports, for example:
        - Bad: `export * from './utils'`
        - Good: `export { foo, bar } from './utils'`

    - Avoid dynamic/conditional module loading patterns
        - Patterns such as dynamic `import(...)`, `require()` with non-static arguments, or runtime code generation
          that depends on bundler behavior are fragile and may not demodulify correctly.  
          For example: `const mod = require("./helpers/" + helperName);`
        - Fix: Prefer static, unconditional imports/exports so Webpack can produce deterministic, statically-analyzable
          output.  
          Note there is no enforcement of this by the plugin, but such patterns may lead to runtime errors.

- Source files and source maps
    - The plugin strips some runtime helpers and rewrites lines; try to preserve source maps
      during your toolchain if you rely on debugging information. Avoid constructs that cause significant codegen
      wrapper insertion.

- Exactly one TypeScript entry module
    - The plugin requires exactly one TypeScript-authored entry module per build. The entry module defines the
      entire public API surface exposed to the Google Apps Script runtime. All GAS-visible functions must
      be exported from this module, either directly or via explicit named re-exports. Other files may participate
      freely in implementation via imports, but only the entry module’s exports are attached to the GAS namespace.
        - Disallowed entry configurations
            - The following are explicitly not supported, even though Webpack itself may allow them:
                - Array-based entries, e.g.:    `entry: { gas: ["./a.ts", "./b.ts"] }`
                - Glob-based or auto-discovered entries, e.g.: ` entry: { gas: glob.sync("src/gas/*.ts") }`
    - See [here](docs/plugin-design.md#why-exactly-one-webpack-entry-is-required) for more details.

- Output filename is intentionally ignored
    - When gas-demodulify is enabled, we ignore, and actually delete the JavaScript bundle that
      Webpack would otherwise emit. This is because that bundle contains runtime artifacts that GAS
      cannot execute. To make this obvious and avoid accidental misuse, the plugin requires a sentinel value
      be specified for `output.filename` in your Webpack config:
      `output: { filename: "OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME" ...`
      Any other value — including omitting `output.filename` — is rejected.
    -
    See [here](docs/plugin-design.md#how-gas-demodulify-separates-wheat-application-code-from-chaff-webpack-boilerplate)
    for more details.

- No aliased re-exports in the entry module
    - Patterns rejected: `export { foo as bar } from './module'`
    - Rationale:
        - Re-exporting with an alias does **not** create a runtime identifier named `bar`
        - Webpack erases alias intent during module graph construction
        - gas-demodulify operates after this erasure and cannot safely recover the original binding
    - Fix: Replace aliased re-exports with an explicit wrapper export in the entry module:
        - Bad:
          ```ts
          export { onOpen as handleOpen } from "./triggers";
          ```
        - Good:
          ```ts
          import { onOpen } from "./triggers";
          export function handleOpen() {
            return onOpen();
          }
          ```

## Configuration

### General Options

#### module.exports.entry

The emitted output filename is derived from the Webpack entrypoint name.
For example, an entry named gas will emit gas.gs. This was discussed in more detail in the previous section's
discusion of the restriction *Exactly one TypeScript entry module*.

### Plugin Constructor Options

The code snippet below illustrates how to pass options to the GASDemodulifyPlugin constructor via
a standard Javascript dictionary:

>       new GASDemodulifyPlugin({
>         namespaceRoot: "MYADDON",
>         subsystem: "GAS",
>         buildMode: "gas",
>         logLevel: "info"
>       });


You can call the plugin with an empty options object, and all options will take their default values.

#### *namespaceRoot*

The top-level global namespace under which all generated symbols will be attached (e.g. MYADDON, MyCompany.ProjectFoo).

- Default: DEFAULT

#### *subsystem*

In most projects, this is a single identifier such as `UI`, `GAS`, or `COMMON`, and for the example above
we get the namespace: `MYADDON.UI` Advanced users may specify a dotted path to create deeper hierarchy:

       namespaceRoot: "MYADDON"
       subsystem: "UI.Dialogs"

Which produces `MYADDON.UI.Dialogs`

- Default: DEFAULT

#### *buildMode*

Controls which artifacts are emitted:

- "gas" → emits .gs
- "ui" → emits .html with inline script tags
- "common" → emits both .gs and .html

- Default: gas

#### *defaultExportName*

Controls how default exports are attached to the GAS namespace.
If this option is provided, the default export is mapped to the specified symbol name.

- Default: - defaultExport

###### Example

Given the following source code:

> export default function foo() {}


If no defaultExportName is specified, the generated output will be:

> globalThis.MYADDON.UI.defaultExport = defaultExport;


If defaultExportName is specified:

>       new GASDemodulifyPlugin({
>         namespaceRoot: "MYADDON",
>         subsystem: "UI",
>         buildMode: "ui",
>         defaultExportName: "main",
>         logLevel: "info"
>       });

In this case, the default export is attached to the GAS namespace using the explicitly provided name main.

> globalThis.MYADDON.UI.main = main;

### Log level

Control the verbosity of the plugin's diagnostic output. Accepted values are:

- "silent" — no *info* or *debug* logging, only *warn* and *error*
- "info" — high-level lifecycle messages (default)
- "debug" — verbose internal diagnostics

Precedence and behavior:

- If the environment variable `LOGLEVEL` is present and set to a valid value, it overrides the explicit `logLevel`
  option passed to the plugin. For example:
    - `LOGLEVEL=debug npm run build` will enable debug output regardless of the
      plugin config's `logLevel` option.
    - `LOGLEVEL=silent npm run build` will surpress all output except for warnings and errors.
      (useful for figuring out which tests in a suite failed without reams of log noise).
- If `LOGLEVEL` is not set, the plugin uses the explicit `logLevel` option when provided.
- If neither `LOGLEVEL` nor an explicit `logLevel` is provided, the default level is `info`.
- Invalid log level values (from the environment or the explicit option) are treated as configuration errors and
  will cause the build to fail.

Tests may set `LOGLEVEL` in the environment or inject `logLevel` into fixture plugin instances.
The environment variable takes precedence.

- Default: info

## Of Interest to Contributors

If you’re interested in the internal architecture of this plugin or in contributing to its development, see:

- [Guidance for Plugin Maintainers](docs/guidance-for-plugin-maintainers.md)
- [Plugin Design](docs/plugin-design.md)

The design discussion also includes a discussion of how webpack typically fits into build pipelines which target
GAS as an execution environment.

