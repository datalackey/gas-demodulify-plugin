# Guidance For Plugin Maintainers

<!-- TOC:START -->
- [Guidance For Plugin Maintainers](#guidance-for-plugin-maintainers)
  - [Build Targets](#build-targets)
  - [First-time setup](#first-time-setup)
  - [Running Tests and Samples](#running-tests-and-samples)
    - [Tests Run Within IDEs May Not Use Latest Edited Source](#tests-run-within-ides-may-not-use-latest-edited-source)
    - [Commands to ensure tests use the latest source](#commands-to-ensure-tests-use-the-latest-source)
- [install deps (only needed once or when package.json changed)](#install-deps-only-needed-once-or-when-packagejson-changed)
- [Packate plugin into dist/](#packate-plugin-into-dist)
    - [Test Troubleshooting Tips](#test-troubleshooting-tips)
  - [Formatting](#formatting)
  - [Contributing a PR](#contributing-a-pr)
<!-- TOC:END -->


This section is targeted to developers interested in contributing (features, docs, tests, fixes, etc.) to the
plugin itself, rather than plugin users. So far all development has been done by on nixos Linux. So
MacOS or Windows developers may need to wing it a bit.

## Build Targets

See the workspace project graph: [Nx build graph](nx-build-graph.html).

## First-time setup

Run the provided development setup script to install dependencies, compile sources, run
the test-suite, and package the plugin for release.

```sh
git clone git@github.com:buildlackey/gas-demodulify-plugin.git
cd gas-demodulify-plugin
bash ./scripts/dev_setup.sh
```

This will leave the compiled artifacts in `dist/` and produce the packaged plugin under `dist/plugin`
so samples and IDE runners will use the latest compiled code.

## Running Tests and Samples

### Tests Run Within IDEs May Not Use Latest Edited Source

Some workflows (and the `samples/` projects) require the packaged plugin
from `dist/plugin` (for example `samples/with-source-maps` references `file:../../dist/plugin`).
When you run tests from an IDE or when a sample project
requires the plugin from `dist/plugin`, it will pick up the generated package under `dist/plugin` rather than
the TypeScript source you are editing under `src/`.

That means: if you change source files in `src/` and then run tests from your IDE without
rebuilding the packaged plugin, the tests may still exercise the old compiled code under `dist/plugin`.

We have a guard in place which warns you if the `dist/plugin` package is out-of-date with respect to the `src/` files.
It will trigger when running tests from the IDE. You will see: "Error: Stale dist detected."
However, no such guard exists for the samples yet.

TODO - obsolete here -- update the doc

### Commands to ensure tests use the latest source

Before running the samples or tests from an IDE
make sure the compiled output and packaged plugin are up-to-date. The simplest sequence is:

```sh
# install deps (only needed once or when package.json changed)
npm install

# Packate plugin into dist/
npm run package:release

```

### Test Troubleshooting Tips

- If tests run in your IDE appear to be 'stale' (not reflecting recent edits),
  re-run `npm run compile` before re-running tests from the IDE. Future documentation updates will
  describe how this can be automated via run configurations in Intellij IDEA.
- If you tweak the plugin and want to see how it works with a sample project, make sure
  you rebuilt the properly packaged plugin via the `package:release` build target.

## Formatting

Code is formatted as part of the release process, so you should not depend on any manual formatting you do in your IDE.

`npm run build` will reformat your code.

`npm run package:release` will fail if formatting is not compliant.

## Contributing a PR

CI runs `npm run package:release` on all supported Node LTS versions.
PRs must pass on all matrix entries before merge.
