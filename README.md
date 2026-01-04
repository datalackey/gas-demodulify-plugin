# gas-demodulify

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
mechanism and its wrapping IIFE. Instead, it generates fresh, GAS-safe JavaScript
compatible with both the GAS runtime and
the [HtmlService](https://developers.google.com/apps-script/reference/html/html-service)
delivery model using:

- user supplied namespace configuration metadata 
- transpiled module sources provided by Webpack’s compilation pipeline 
 (after module dependency resolution and type-checking, but before runtime execution)




## Support for Modern Architectures Comprised of Subsystems 

A modern architecture for a complex GAS add-on typically comprises subsystems, with a common organization 
breaking down into: **ui**, **backend (gas)**, and **common**.  We will describe the operation of the plugin assuming
this tri-layer organization, but the plugin can be adapted to other architectures as well,
as discussed in the configuration section, below.

### UI subsystem

The UI subsystem typically consists of:

- HTMLService dialogs    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; # (not typically bundled, but  pushed 'raw' by clasp)
- Sidebar interfaces     &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; # (not typically bundled, but  pushed 'raw' by clasp)
- svg images for icons   &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; # (not typically bundled, but  pushed 'raw' by clasp)
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
and this requires the code live in a file with extension '.html'.  The other is to 
be included in the server-side GAS code, and thus must have extension '.gs'.


A normal Webpack build cannot satisfy the above requirements, as well as some of the more subtle 
requirements  discussed in [this section](#finer-points-regarding-how-code-must-be-bundled-for-gas)
.
Furthermore, Google Apps Script cannot:
- run Webpack's module runtime, `__webpack_require__`,
- nor its wrapping IIFE, 
- nor resolve its internal module map. 
 
Modern TypeScript/ESM code must therefore be **demodulified** — stripped of all the webpack require stuff, 
and flattened into plain top-level functions.

**gas-demodulify** performs exactly this transformation.

------------------------------------------------------------------------

## Example

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

### 1) Why should client-side browser code be processed with Webpack at all?


Although the UI code of a GAS add-on ultimately executes inside your
browser (for example, within a dialog or sidebar iframe),
the browser never receives your JavaScript as a distinct chunk separate from the surrounding mark-up. 
All UI code must be delivered through HtmlService, which expects you to load exactly one HTML file,
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

is fundamentally unsupported in GAS. Therefore:
Even though the browser environment itself is fully capable of executing ES, GAS cannot deliver ES modules.
For this reason, all UI code—even purely client-side code—must be bundled
into a single, flat `<script>` block, with all imports resolved ahead of
time, no import or export syntax remaining, and no Webpack runtime
present. Webpack, in conjunction with our plugin, performs this 'flattening' 
and demodulification automatically.




### 2) How Load Order Can Be Leveraged to Manage Inter-Subsystem Dependencies

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
subsystems that depend on them.   You still have to think about your inter-subsystem dependencies
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

## Configuration


### General Options 


#### module.exports.entry 

The emitted output filename is derived from the Webpack entrypoint name.
For example, an entry named gas will emit gas.gs. This was discussed in more detail in the previous section.




### Plugin Constructor Options

The code snippet below illustrates how to pass options to the GASDemodulifyPlugin constructor via
a standard Javascript dictionary:

>       new GASDemodulifyPlugin({
>         namespaceRoot: "MYADDON",
>         subsystem: "GAS",
>         buildMode: "gas",
>         logLevel: "info"
>       });



#### *namespaceRoot*

The top-level global namespace under which all generated symbols will be attached (e.g. MYADDON, MyCompany.ProjectFoo).


#### *subsystem*

       namespaceRoot: "MYADDON"
       subsystem: "UI"

In most projects, this is a single identifier such as `UI`, `GAS`, or `COMMON`, and for the example above
we get the namespace: `MYADDON.UI` Advanced users may specify a dotted path to create deeper hierarchy:

       namespaceRoot: "MYADDON"
       subsystem: "UI.Dialogs"

Which produces `MYADDON.UI.Dialogs`


#### *buildMode*

Controls which artifacts are emitted:

- "gas" → emits .gs
- "ui" → emits .html with inline script tags
- "common" → emits both .gs and .html


#### *defaultExportName*

Controls how default exports are attached to the GAS namespace.

If this option *is* provided, the default export is mapped to the specified symbol name.
If this option *is not* provided, default exports are mapped to the symbol `defaultExport`.

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
>
>
#### Log level

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

## Design & Internals

If you’re interested in the internal architecture of this plugin or in contributing to its development, see:

- [Guidance for Plugin Maintainers](docs/guidance-for-plugin-maintainers.md)
- [Plugin Design](docs/plugin-design.md)


The design discussion also includes a discussion of how webpack typically fits into build pipelines which target
GAS as an execution environment.
