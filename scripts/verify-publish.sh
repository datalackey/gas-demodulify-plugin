#!/usr/bin/env bash
set -euo pipefail

echo "=== Verifying publish artifact ==="

# Move to project root (script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

# Read name + version from root package.json
PKG_NAME=$(node -p "require('./package.json').name")
PKG_VERSION=$(node -p "require('./package.json').version")

echo "Package name: $PKG_NAME"
echo "Package version: $PKG_VERSION"

echo
echo "1) Running Nx release build..."
npx nx run gas-demodulify:release --skip-nx-cache

echo
echo "2) Creating tarball..."
TARBALL=$(npm pack)
echo "Created: $TARBALL"

echo
echo "3) Creating temporary install directory..."
TMP_DIR=$(mktemp -d)
echo "Temp dir: $TMP_DIR"
cd "$TMP_DIR"

echo
echo "4) Initializing temporary npm project..."
npm init -y >/dev/null 2>&1

echo
echo "5) Installing local tarball..."
npm install "$PROJECT_ROOT/$TARBALL"

echo
echo "6) Requiring package in Node..."
node -e "require('$PKG_NAME'); console.log('Require succeeded')"

echo
echo "7) Verifying installed version..."
INSTALLED_VERSION=$(node -p "require('$PKG_NAME/package.json').version")

if [[ "$INSTALLED_VERSION" != "$PKG_VERSION" ]]; then
  echo "ERROR: Installed version ($INSTALLED_VERSION) does not match root version ($PKG_VERSION)"
  exit 1
fi

echo "Version verified: $INSTALLED_VERSION"

echo
echo "8) Cleaning up..."
cd "$PROJECT_ROOT"
rm -rf "$TMP_DIR"
rm -f "$TARBALL"

echo
echo "=== Publish verification PASSED ==="

