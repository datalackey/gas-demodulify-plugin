#!/bin/sh
# Run a command, echo its output, and on failure print a highlighted diagnostic block
# with ANSI colors and an optional blinking effect.
# Usage:
#   ./scripts/run-with-diagnostics.sh --cmd "prettier --check ." --header "PRETTIER CHECK FAILED" --detail "Run locally: npx nx run gas-demodulify-plugin:format"

set -eu

usage() {
  cat <<'USAGE' >&2
Usage: run-with-diagnostics.sh --cmd "<command>" --header "<HEADER TEXT>" --detail "<DETAIL TEXT>"

Options:
  --cmd     The command to run (quoted as a single string).
  --header  Short header printed on failure (shown in red with a ❌).
  --detail  Longer detail printed after the header.

The script exits with the same exit code as the command. On failure it prints
colored, clearly delineated diagnostics and shows the tail of the command output.
USAGE
  exit 2
}

CMD=""
HEADER=""
DETAIL=""

# Simple arg parsing
while [ "$#" -gt 0 ]; do
  case "$1" in
    --cmd)
      shift
      if [ $# -eq 0 ]; then
        usage
      fi
      CMD="$1"
      ;;
    --header)
      shift
      HEADER="$1"
      ;;
    --detail)
      shift
      DETAIL="$1"
      ;;
    --help|-h)
      usage
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      ;;
  esac
  shift
done

if [ -z "$CMD" ]; then
  echo "Error: --cmd is required" >&2
  usage
fi

# Make a temporary file to capture output
TMPLOG="$(mktemp 2>/dev/null || echo "/tmp/run-with-diagnostics.$$")"

echo "Running: $CMD"
# Run the command and capture output
sh -c "$CMD" >"$TMPLOG" 2>&1
RET=$?

# Always stream the command output so it's visible in CI logs
cat "$TMPLOG"

if [ $RET -ne 0 ]; then
  # ANSI escape sequences: red, yellow, dim, reset; blink (
  BLINK="\033[5m"
  RED="\033[31m"
  YELLOW="\033[33m"
  DIM="\033[90m"
  RESET="\033[0m"

  printf "\n${BLINK}${RED}========================================\n" >&2
  printf "❌ %s\n" "${HEADER}" >&2
  printf "========================================${RESET}\n\n" >&2

  if [ -n "${DETAIL}" ]; then
    printf "${YELLOW}%s${RESET}\n\n" "${DETAIL}" >&2
  fi

  printf "${DIM}--- Command output (tail 200 lines) ---${RESET}\n" >&2
  tail -n 200 "$TMPLOG" >&2 || true
  rm -f "$TMPLOG" || true
  exit $RET
else
  printf "\n\033[32m✔ %s succeeded\033[0m\n" "${HEADER}"
  rm -f "$TMPLOG" || true
  exit 0
fi

