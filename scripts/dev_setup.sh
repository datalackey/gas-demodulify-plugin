#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js is not installed."
  echo "Required: Node.js >= 18"
  exit 1
fi

NODE_VERSION_RAW="$(node -v)"   # e.g. v18.20.5, v20.18.1, v22.0.0
NODE_MAJOR="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"

MIN_NODE_MAJOR=18

if (( NODE_MAJOR < MIN_NODE_MAJOR )); then
  echo "ERROR: Unsupported Node.js version: $NODE_VERSION_RAW"
  echo "Required: Node.js >= $MIN_NODE_MAJOR"
  exit 1
fi

echo "Node.js version OK: $NODE_VERSION_RAW"

npm install
npm run release
