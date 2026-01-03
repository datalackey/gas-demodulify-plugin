#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "Required: Node.js 18.x or 20.x"
  exit 1
fi

NODE_VERSION_RAW="$(node -v)"        # e.g. v20.18.1
NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"

if [[ "$NODE_MAJOR" != "18" && "$NODE_MAJOR" != "20" ]]; then
  echo "ERROR: Unsupported Node.js version: $NODE_VERSION_RAW"
  echo "Required: Node.js 18.x or 20.x"
  exit 1
fi

echo "Node.js version OK: $NODE_VERSION_RAW"
npm install
npm run release



