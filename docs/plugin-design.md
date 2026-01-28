# Plugin Design

<!-- TOC:START -->
- [Plugin Design](#plugin-design)
  - [Introduction](#introduction)
  - [Simple Example](#simple-example)
    - [Why Does It Fail When Deployed to GAS ?](#why-does-it-fail-when-deployed-to-gas-)
    - [If Webpack Output Fails in GAS, Why Use It at All?](#if-webpack-output-fails-in-gas-why-use-it-at-all)
  - [How gas-demodulify Separates Wheat (Application Code) from Chaff (Webpack Boilerplate)](#how-gas-demodulify-separates-wheat-application-code-from-chaff-webpack-boilerplate)
    - [Key Design Responsibilities of the Code Emitter](#key-design-responsibilities-of-the-code-emitter)
      - [1. Select reachable modules only](#1-select-reachable-modules-only)
      - [2. Strip all Webpack runtime constructs](#2-strip-all-webpack-runtime-constructs)
      - [3. Rewrite module contents as top-level code](#3-rewrite-module-contents-as-top-level-code)
      - [4. Bind imports via explicit symbol resolution](#4-bind-imports-via-explicit-symbol-resolution)
      - [5. Attach exports to explicit namespaces](#5-attach-exports-to-explicit-namespaces)
  - [Why Exactly One Webpack Entry Is Required](#why-exactly-one-webpack-entry-is-required)
  - [Rationale for Referencing Webpack’s Internal RuntimeSpec](#rationale-for-referencing-webpacks-internal-runtimespec)
    - [Must Specify 'Which Runtime?' During Lookup of Module's Generated Code](#must-specify-which-runtime-during-lookup-of-modules-generated-code)
    - [Dipping Into Webpack's Internal Types to Pull Out RuntimeSpec](#dipping-into-webpacks-internal-types-to-pull-out-runtimespec)
    - [Why We Do Not Use WebpackRuntimeSpec as Our Internal Runtime Type](#why-we-do-not-use-webpackruntimespec-as-our-internal-runtime-type)
  - [Addenda: Understanding webpack_require](#addenda-understanding-webpack_require)
<!-- TOC:END -->

## Introduction

To understand gas-demodulify’s design, we must first understand Webpack’s value-add
as a component in [Google Apps Script](https://workspace.google.com/products/apps-script/) (GAS)
build pipelines—and just as importantly, where Webpack’s default output model
fundamentally conflicts with GAS’s execution model.
Modern GAS projects are increasingly written in [TypeScript](https://www.typescriptlang.org/)
and structured as multi-module codebases using standard [ES](https://www.typescriptlang.org/)
module syntax (`import` / `export`). While this approach dramatically improves maintainability and testability,
Google Apps Script does not support modules of any kind. All executable code
must ultimately be presented as top-level script code, with callable functions
defined in global scope. This includes not only code that runs server side in the GAS environment, but
also client code that runs in the browser, as discussed in more detail
[here](../README.md#why-should-client-side-browser-code-be-processed-with-webpack-at-all).

## Simple Example

In this section, we examine a small but representative example that fails in GAS:
an add-on which injects a custom top level menu item that invokes a function
`foo()`. That function is defined in its own module (`foo.ts`) and, in turn,
imports and invokes a stub function `bar()` from another module (`bar.ts`).

Conceptually, the example codebase looks like this:

```text
entrypoint.ts
   |
   | adds new item to sheets menu, and imports / invokes
   v
 foo.ts
   |
   | imports 
   v
 bar.ts
   |
   | writes to console
   v
   console.log(..)
 
```

And here is the code:

*entrypoint.ts*

```javascript
import {foo} from "./foo";

export function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu("Demo")
        .addItem("click to invoke foo()", "foo")
        .addToUi();
}
````

*foo.ts*

```javascript
import {bar} from "./bar"; // ❌ `import` is illegal in GAS

export function foo() {
    bar();
}
````

*bar.ts*

```javascript
export function bar() {     // ❌ `export` is illegal in GAS
    console.log("bar called");
}

```

### Why Does It Fail When Deployed to GAS ?

The simple answer: it uses modules, which GAS does not support. So, we turn to Webpack
to bundle and flatten the code into a single artifact. However, even after bundling
we find the code is still not runnable in GAS without further transformation. Take a look
at the highly simplified version of the output that Webpack would
produce for this codebase, and see if you can figure out why.

```javascript
(function () {
    var __webpack_modules__ = {
        "./bar.ts": function (module, exports) {
            function bar() {
                console.log("bar called");
            }

            exports.bar = bar;
        },

        "./foo.ts": function (module, exports, __webpack_require__) {
            var bar = __webpack_require__("./bar.ts").bar;

            function foo() {
                bar();
            }

            exports.foo = foo;
        },

        "./entrypoint.ts": function (module, exports, __webpack_require__) {
            var foo = __webpack_require__("./foo.ts").foo;

            function onOpen() {
                SpreadsheetApp.getUi()
                    .createMenu("Demo")
                    .addItem("click to invoke foo()", "foo")
                    .addToUi();
            }

            exports.onOpen = onOpen;
        }
    };

    var __webpack_require__ = /* ... */;  // __webpack_require__ details defered to Addenda to avoid overwhelmging detail

    __webpack_require__("./entrypoint.ts");
}).call(this);

```

One thing that should jump out is that neither `onOpen` nor `foo` are defined at the
top level. Instead, they exist inside the IIFE emitted by Webpack. While the above snippet significantly
simplifies what Webpack would produce (and what it produces varies depending on configuration options,
optimization modes, and Webpack versions), the key structural point remains: we need to get rid of all the
boilerplate that Webpack adds around our code, and we need to make sure that `onOpen` and its cohorts
are defined at the top level so that GAS can discover them.

Many GAS projects attempt to extract application code from boilerplate via post-processing
techniques such as regex-based rewriting of the emitted
bundle. While workable in simple cases, these approaches are brittle in the face
of Webpack version changes, optimization modes, and edge cases.
In subsequent sections we will take a detailed look at how  `gas-demodulify` trims
all the boilerplate so that our application code is 'top level visible'.
For now, suffice it to say that our plugin
intercepts Webpack's output before bundling, replacing its emitter with one
that produces GAS-safe output directly, while still leveraging Webpack’s module
graph for dependency resolution and dead-code elimination.

### If Webpack Output Fails in GAS, Why Use It at All?

Although Webpack bundles can't be immediately executed in GAS environments, Webpack
remains extremely valuable in GAS-targeted build pipelines because it provides a precise,
deterministic module graph. At build time, Webpack:

- starts from one or more declared entrypoints,
- follows import chains transitively,
- includes only modules that are reachable,
- and excludes dead or unused code automatically.

At a high level, Webpack’s role in a GAS build pipeline can be summarized as follows:

```text
TypeScript modules
|
v
Webpack module graph
|
v
Reachable modules only
(dead code removed)
```

This makes Webpack an ideal frontend compiler for GAS projects. It answers the
critical question: which code actually matters?
Even though GAS ultimately requires a single, flat script environment,
determining what belongs in that environment and what does not is non-trivial
in a modular codebase. Webpack -- in conjunction with our plugin, discussed below --
solves that problem reliably.

## How gas-demodulify Separates Wheat (Application Code) from Chaff (Webpack Boilerplate)

At a high level, `gas-demodulify` positions itself inside Webpack’s compilation
pipeline, after module resolution and transpilation have completed, but **before**
Webpack emits its final runtime bundle.
The core logic responsible for emitting GAS-safe output lives in
[CodeEmitter.ts](../src/plugin/code-emission/CodeEmitter.ts), which replaces Webpack’s standard bundle emitter with one
tailored to GAS’s execution model.

So, rather than treating Webpack’s output as an opaque string to be post-processed,
`CodeEmitter` operates on structured compilation data that Webpack provides.
In particular, it consumes:

- Webpack’s resolved module graph
- Transpiled module source code
- Symbol and dependency metadata for each module

Webpack’s standard output bundle is actually deliberately deleted by the plugin.
If we did not delete it, and you were able to examine its content you would see all manner of
GAS-incompatible Webpack runtime constructs (`__webpack_require__`, etc.)
This is why we mandate that `output.filename` be set to
`OUTPUT-BUNDLE-FILENAME-DERIVED-FROM-ENTRY-NAME`. This makes it clear that whatever value you pick for that
configuration setting, it will be ignored in favor of `module.entry : {  outputname: './some/path/somefile.ts' }`.




---

### Key Design Responsibilities of the Code Emitter

At a conceptual level, the emitter performs the following steps:

#### 1. Select reachable modules only

The emitter iterates over the module graph starting from the declared entrypoints,
ensuring that only code reachable through explicit imports is included in the
generated output.

#### 2. Strip all Webpack runtime constructs

No runtime loader, no module cache, and no synthetic export objects are emitted.
Constructs such as `__webpack_require__`, module factory wrappers, and IIFEs
are intentionally omitted.

#### 3. Rewrite module contents as top-level code

Each module’s executable statements are emitted as plain JavaScript at the
top level. This ensures that GAS can discover triggers, menu handlers, and
callable functions using its normal global-scope scanning rules.

#### 4. Bind imports via explicit symbol resolution

Instead of runtime `require` calls, imported symbols are resolved statically
and rewritten as references to previously emitted bindings.

#### 5. Attach exports to explicit namespaces

Exported symbols are attached directly to user-defined global namespaces
(for example `MYADDON.GAS` or `MYADDON.UI`), avoiding any reliance on `this`,
UMD-style globals, or runtime side effects.

---

Throughout this process, the emitter relies heavily on invariants enforced by
Webpack’s compilation pipeline. This allows the plugin to remain relatively small
while still supporting complex dependency graphs and large codebases.

The extensive inline comments in **`CodeEmitter.js`** document the precise
invariants and assumptions relied upon during emission. Readers interested in
modifying or extending the plugin are encouraged to start there.

## Why Exactly One Webpack Entry Is Required

`gas-demodulify` encourages (and enforces) a build model where each subsystem is packaged independently:

- one build
- one package.json
- one Webpack configuration
- one entrypoint that defines the subsystem's public API surface.
- one output artifact.

This aligns with Google Apps Script’s single-global-scope execution model and ensures deterministic,
collision-free output. As an example of what could go wrong if multiple entries were allowed, consider
the following scenario, where a build has two entrypoints that both import the same dependency (lodash):

- entryA → imports lodash
- entryB → imports lodash

In a normal Webpack environment, this is safe. Each entry’s dependency graph is
wrapped, scoped, and coordinated at runtime. Shared dependencies such as lodash
are de-duplicated or isolated by the module system. GAS
provides none of those guarantees:

- all code executes in a single, flat global scope
- there is no module loader
- there is no runtime isolation
- there is no mechanism to safely coordinate shared dependencies

Allowing multiple entries would therefore result in the same dependency being
emitted more than once, with helpers, [polyfills](https://developer.mozilla.org/en-US/docs/Glossary/Polyfill),
and internal symbols colliding at the top level. Even when the duplicated code is byte-for-byte identical, the
resulting behavior is undefined and may fail in subtle ways.

For this reason, gas-demodulify treats the Webpack entrypoint as the single
execution root for a build. All reachable code is flattened from that root,
emitted exactly once, and attached to a single, explicit namespace. If a
project grows large enough to require multiple independent API surfaces, the
correct solution is multiple builds, not multiple entries.

## Rationale for Referencing Webpack’s Internal RuntimeSpec

### Must Specify 'Which Runtime?' During Lookup of Module's Generated Code

We need a notion of a 'RuntimeSpec' because Webpack’s code-generation pipeline
is runtime-aware, and any plugin that inspects or emits generated code must respect
runtime scoping to be correct.

More precisely:

- Webpack can generate different code per runtime
  In Webpack, a single module may be generated multiple times, once per runtime, where runtime might be any of:
    - main runtime
    - async runtime(s)
    - worker runtimes
    - multiple entrypoints with distinct runtimes

Webpack therefore does not store a single “generated source” per module.
Instead, it stores code-generation results keyed by runtime.
So when we ask Webpack for generated code, we must specify: “Which runtime’s version of this module do you want?”
That question is answered by a RuntimeSpec.
> (Note: In this context, “runtime” refers to Webpack’s internal execution contexts (bootstrap + module loading),
> not to host environments such as browsers, Node.js, or
> Google Apps Script's [v8-based host runtime](https://developers.google.com/apps-script/guides/v8-runtime).)

### Dipping Into Webpack's Internal Types to Pull Out RuntimeSpec

We 'extract' the definition we need of RuntimeSpec from Webpack's internal types as follows:

```typescript
type WebpackRuntimeSpec = Parameters<import("webpack").CodeGenerationResults["get"]> [1];
```

This ensures that when we interact with Webpack APIs, we supply exactly the type Webpack expects,
even though Webpack does not export the underlying alias.
This is a deliberate, contract-level dependency, where we attempt to express our
dependency on Webpack’s Internal API surface as minimally as possible.

### Why We Do Not Use WebpackRuntimeSpec as Our Internal Runtime Type

Although we must interoperate with Webpack’s internal RuntimeSpec, we intentionally do not propagate
that type through our own codebase. Instead, we define our own internal abstraction:

```typescript
export type RuntimeSpec = string | Set<string> | undefined;
````

WebpackRuntimeSpec reflects Webpack’s current internal representation, which specifies a sortable set with deterministic
ordering, rather than an abstract Set. Since our code does not rely on such ordering guarantees, we avoid coupling
to them by defining our own simpler type.

function getModuleSource(compilation: Compilation, module: Module, runtime: RuntimeSpec): string {
const { codeGenerationResults } = compilation as CompilationWithCodeGen;
if (codeGenerationResults === undefined) {
Logger.debug("codeGenerationResults not available; skipping module source emission");
return "";
}

    const codeGen = codeGenerationResults.get(module, runtime as WebpackRuntimeSpec);

2. Avoid leaking Webpack internals into our domain model

If we used WebpackRuntimeSpec directly throughout our code, we would be forcing:

Webpack’s internal data structures

ordering guarantees

and future representation choices

into places where they have no semantic relevance.

By using a simple Set<string> internally, we:

keep our domain model minimal and precise

isolate Webpack-specific concerns at the integration boundary

avoid cascading changes if Webpack alters its internal runtime representation

3. Localize and fail fast on breaking changes

All assumptions about Webpack’s runtime representation are intentionally localized to a single boundary.

If Webpack changes the type it expects:

the derived WebpackRuntimeSpec alias will fail to compile, or

the adapter layer will surface the mismatch immediately

This provides a fail-fast upgrade signal, without forcing internal logic to change.

describe why we don't use this type directly, but instead define our own RuntimeSpec type... explain
reasons
related to desire to couple to sorterdSet implementation.

Our plugin consumes Webpack’s code-generation results --
inspects and emits code using Webpack’s
CodeGenerationResults.get(module, runtime) API.

That API requires a runtime spec because:

The same module may have different output depending on the runtime

The runtime affects:

- bootstrap code
- chunk loading logic
- globals availability
- execution environment assumptions

Runtime awareness is not optional. If we ignored runtime scoping, we could end up:

- emitting the wrong code
- mixing incompatible runtime variants
- breaking multi-entry or async builds in subtle ways


3. Why we model RuntimeSpec internally instead of passing it through blindly

We introduce our own RuntimeSpec type because:

We need to carry runtime information through our own logic

Webpack’s internal RuntimeSpec is:

not publicly exported

more specific than we need

tied to Webpack’s internal ordering guarantees

Our code only needs to know:

“Which runtime(s) does this operation apply to?”

We do not need:

ordering

sort stability

Webpack’s internal SortableSet mechanics

So we model runtime membership abstractly and adapt at the integration boundary.

4. Why this is architecturally correct

This design gives us:

Correctness — runtime-scoped code generation

Isolation — Webpack internals don’t leak into our domain model

Maintainability — future Webpack changes are localized

Testability — simple sets are easy to construct and reason about

The key principle is:

RuntimeSpec is domain data in our code,
but API-specific data at the Webpack boundary.

## Addenda: Understanding webpack_require

__webpack_require__ is Webpack’s runtime module loader. It exists to recreate
ES module semantics at runtime by dynamically executing module factory functions,
wiring up imports, and managing a module cache.

Conceptually, it looks something like this:

```javascript
var __webpack_module_cache__ = {};

function __webpack_require__(moduleId) {
    if (__webpack_module_cache__[moduleId]) {
        return __webpack_module_cache__[moduleId].exports;
    }

    var module = {exports: {}};
    __webpack_module_cache__[moduleId] = module;

    __webpack_modules__[moduleId](
        module,
        module.exports,
        __webpack_require__
    );

    return module.exports;
}
```

Every import in the original TypeScript source is rewritten into a call to
__webpack_require__. For example:

import { bar } from "./bar";

becomes:

var bar = __webpack_require__("./bar.ts").bar;

This runtime is what allows Webpack bundles to behave like modular programs in
environments such as browsers or Node.js.


