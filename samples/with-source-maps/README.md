# Source Maps Demo (gas-demodulify-plugin)

This sample shows how to:

- Bundle Google Apps Script backend code with Webpack
- Use gas-demodulify-plugin to expose global triggers
- Generate inline source maps for debugging

## Usage

```bash

rm -rf node_modules package-lock.json
npm install
npm run build

Push dist/backend.gs to a GAS project and trigger onOpen
to observe a source-mapped stack trace.
```
