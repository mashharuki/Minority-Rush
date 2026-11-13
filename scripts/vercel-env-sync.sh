#!/usr/bin/env bash
# Copies variables from <app-dir>/.env.local to the linked Vercel project WITHOUT printing their values.
#
# Usage:   scripts/vercel-env-sync.sh <app-dir> <production|preview> NAME [NAME...]
# Example: SENSITIVE=1 scripts/vercel-env-sync.sh apps/sponsor-api production PRIVY_APP_ID PIMLICO_API_KEY
#
# - Values are parsed by bun (handles quotes and multi-line PEM keys) and piped to `vercel env add` via stdin.
# - SENSITIVE=1 stores them as Vercel "sensitive" variables (write-only, cannot be read back from the dashboard).
# - Existing variables with the same name/target are replaced.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "usage: $0 <app-dir> <production|preview> NAME [NAME...]" >&2
  exit 2
fi

dir="$1"
target="$2"
shift 2

[ -f "$dir/.env.local" ] || { echo "missing $dir/.env.local" >&2; exit 1; }

# Use the installed CLI if there is one, otherwise fetch it with npx (login state is shared: ~/.vercel / app data dir).
if command -v vercel >/dev/null 2>&1; then
  vercel_cmd=(vercel)
else
  echo "vercel not found in PATH: using 'npx --yes vercel' instead"
  vercel_cmd=(npx --yes vercel)
fi

sensitive_flag=""
if [ "${SENSITIVE:-0}" = "1" ]; then sensitive_flag="--sensitive"; fi

for name in "$@"; do
  value="$(cd "$dir" && NAME="$name" bun -e 'process.stdout.write(process.env[process.env.NAME] ?? "")')"
  if [ -z "$value" ]; then
    echo "skip   $name (empty or not set in $dir/.env.local)"
    continue
  fi
  (cd "$dir" && "${vercel_cmd[@]}" env rm "$name" "$target" --yes >/dev/null 2>&1 || true)
  # shellcheck disable=SC2086
  (cd "$dir" && printf '%s' "$value" | "${vercel_cmd[@]}" env add "$name" "$target" $sensitive_flag >/dev/null)
  echo "set    $name ($target${sensitive_flag:+, sensitive})"
done
