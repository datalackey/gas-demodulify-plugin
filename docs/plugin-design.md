
# Plugin Design

## Introduction

To understand gas-demodulify’s design, we must first understand Webpack’s value-add
as a component in Google Apps Script (GAS) build pipelines—and just as importantly,
where Webpack’s default output model fundamentally conflicts with GAS’s execution model.

Modern GAS projects are increasingly written in TypeScript and structured as
multi-module codebases using standard ES module syntax (`import` / `export`).
While this approach dramatically improves maintainability and testability,
Google Apps Script does not support modules of any kind. All executable code
must ultimately be presented as top-level script code, with callable functions
defined in the global scope.

In this section, we examine a small but representative example: a Google Sheets
extension that adds a custom menu item which, when clicked, invokes a function
`foo()`. That function is defined in its own module (`foo.ts`) and, in turn,
imports and invokes a stub function `bar()` from another module (`bar.ts`).

Conceptually, the example codebase looks like this:

```text
entrypoint.ts
   |
   | imports
   v
 foo.ts
   |
   | imports
   v
 bar.ts
```

We will see:

why this modular TypeScript code cannot be executed directly in GAS,

how Webpack flattens the module graph into a single bundle,

and why that bundle—while a step in the right direction—is still not runnable
in GAS without further transformation.

Many GAS projects attempt to bridge this final gap using post-processing
techniques such as string substitution or regex-based rewriting of the emitted
bundle. While workable in simple cases, these approaches are brittle in the face
of Webpack version changes, optimization modes, and edge cases.

gas-demodulify takes a different approach. Instead of post-processing Webpack’s
output, it intercepts Webpack before bundling, replacing its emitter with one
that produces GAS-safe output directly, while still leveraging Webpack’s module
graph for dependency resolution and dead-code elimination.

Why Use Webpack in GAS Build Pipelines?

Although Google Apps Script cannot execute Webpack bundles directly, Webpack
remains extremely valuable in GAS build pipelines because it provides a precise,
deterministic module graph.

At build time, Webpack:

starts from one or more declared entrypoints,

follows import chains transitively,

includes only modules that are reachable,

and excludes dead or unused code automatically.

At a high level, Webpack’s role in a GAS build pipeline can be summarized as follows:

TypeScript modules
        |
        v
  Webpack module graph
        |
        v
 Reachable modules only
 (dead code removed)


This makes Webpack an ideal frontend compiler for GAS projects. It answers the
critical question:

Which code actually matters?

Even though GAS ultimately requires a single, flat script environment,
determining what belongs in that environment—and what does not—is non-trivial
in a modular codebase. Webpack solves that problem reliably.

A Motivating Example

Consider the following TypeScript code used in a Google Sheets add-on.

entrypoint.ts
import { foo } from "./foo";

export function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Demo")
    .addItem("click to invoke foo()", "foo")
    .addToUi();
}

foo.ts
import { bar } from "./bar"; // ❌ `import` is illegal in GAS

export function foo() {
  bar();
}

bar.ts
export function bar() {     // ❌ `export` is illegal in GAS
  console.log("bar called");
}


This codebase is idiomatic modern TypeScript. However, it cannot be deployed to
Google Apps Script as-is:

GAS does not support import or export

GAS has no module loader

GAS discovers triggers and menu handlers only at the top level

To make this code executable, all modules must be flattened into a single
GAS-safe artifact.

What Webpack Produces (Simplified)

Structurally, the emitted bundle can be visualized like this:

┌─────────────────────────────────────────┐
│ Runtime IIFE                             │
│                                         │
│  __webpack_require__                    │
│  module cache                           │
│                                         │
│  module factory functions               │
│    ├─ function foo() { ... }            │
│    └─ function onOpen() { ... }         │
│                                         │
│  exports.foo = foo                      │
│  exports.onOpen = onOpen                │
│                                         │
└───────────────┬─────────────────────────┘
                │
         invoked via
                │
          .call(this)


At a high level, Webpack transforms the above modules into something resembling
the following:

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

  var __webpack_require__ = /* ... */;

  __webpack_require__("./entrypoint.ts");
}).call(this);


Although foo and onOpen exist as concrete functions, they are defined inside
Webpack-managed module factories and never become top-level bindings in the
Google Apps Script execution environment.

What webpack_require Does

__webpack_require__ is Webpack’s runtime module loader. It exists to recreate
ES module semantics at runtime by dynamically executing module factory functions,
wiring up imports, and managing a module cache.

Conceptually, it looks something like this:

var __webpack_module_cache__ = {};

function __webpack_require__(moduleId) {
  if (__webpack_module_cache__[moduleId]) {
    return __webpack_module_cache__[moduleId].exports;
  }

  var module = { exports: {} };
  __webpack_module_cache__[moduleId] = module;

  __webpack_modules__[moduleId](
    module,
    module.exports,
    __webpack_require__
  );

  return module.exports;
}


Every import in the original TypeScript source is rewritten into a call to
__webpack_require__. For example:

import { bar } from "./bar";


becomes:

var bar = __webpack_require__("./bar.ts").bar;


This runtime is what allows Webpack bundles to behave like modular programs in
environments such as browsers or Node.js.


Why This Output Cannot Run in Google Apps Script

Although the bundle above is valid JavaScript, it is not executable in Google Apps Script for several fundamental reasons.

1. Functions Are Not Defined at the Top Level

Google Apps Script discovers triggers (onOpen, onEdit, etc.) and callable menu handlers by scanning the top-level scope.

In a Webpack bundle:

onOpen and foo are not top-level functions

they exist inside a runtime-managed closure

they are not directly visible to GAS

2. The Runtime Loader Has No Meaning in GAS

Google Apps Script does not support:

runtime module execution

dynamic module caches

synthetic export objects

There is no supported execution model in which __webpack_require__ can operate.

3. Reliance on this Is Unsafe in GAS

Webpack (and UMD-style bundlers more generally) often attempt to expose public symbols by attaching them to this:

(function (root) {
  root.MyLib = { foo };
})(this);


This assumes that this refers to the global object.

However, Google Apps Script runs on a modern V8-based runtime with strict-mode–like semantics:

this is not reliably bound to the global object

in many contexts, this is undefined

behavior can vary across executions due to VM recycling

As a result, attaching exports via this is fundamentally unreliable in GAS.

Design Implication

At a high level, Webpack wraps our entrypoint code in a runtime IIFE.
▶️ That IIFE is explicitly invoked with this, but the invocation itself does not guarantee that this refers to the global object in GAS.

This means that functions we want to call from Google Apps Script—either as triggers or via google.script.run—are not defined at the top level.

Webpack attempts to expose these functions by attaching them to this, but in the Apps Script V8 runtime—where strict-mode rules apply—this is not guaranteed to reference the global object. As a result, those functions cannot be safely hoisted into a global namespace.

This incompatibility reflects a fundamental mismatch between:

Webpack’s runtime-oriented module system, and

GAS’s global, script-based execution model

The remainder of this document explains how gas-demodulify resolves this mismatch by intercepting Webpack before bundling and replacing its emitter with one that produces GAS-safe output.

