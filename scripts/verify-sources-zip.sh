#!/usr/bin/env bash
# Checks that Firefox Add-ons reviewers can rebuild Clipwise from the sources zip: unpacks
# .output/clipwise-<version>-sources.zip into a temporary folder, installs and builds there
# exactly as the README's "Build from source" section tells them to, and compares the
# result with .output/firefox-mv3, file by file. Run `pnpm zip:firefox` first.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('$root/package.json').version")"
sources="$root/.output/clipwise-$version-sources.zip"
built="$root/.output/firefox-mv3"

if [[ ! -f "$sources" || ! -d "$built" ]]; then
  echo "Run \`pnpm zip:firefox\` first: $sources or $built is missing." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
unzip -q "$sources" -d "$work"
echo "Rebuilding from $(basename "$sources") in $work…"
(
  cd "$work"
  pnpm install --frozen-lockfile --prefer-offline >/dev/null
  pnpm build:firefox >/dev/null
)

if diff -r "$built" "$work/.output/firefox-mv3"; then
  echo "OK: the rebuilt extension is identical to .output/firefox-mv3."
else
  echo "The rebuilt extension differs from .output/firefox-mv3 (see above)." >&2
  exit 1
fi
