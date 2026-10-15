#!/usr/bin/env bash
# Downloads what the end-to-end tests need beyond the installed browsers, for Linux
# x86-64:
#  - the oldest browsers Clipwise supports, Chrome for Testing 120 and Firefox ESR 140,
#    for `pnpm test:e2e:oldest`;
#  - Xvfb, a virtual display, for tests/e2e/desktop.spec.ts, which presses keys and
#    clicks menus as a person does (Debian and Ubuntu only: it comes from apt).
# Everything goes into ~/.cache/clipwise-e2e-browsers, where the tests look for it, and
# nothing is installed system-wide. Running it again skips what is already there.
set -euo pipefail

DEST="$HOME/.cache/clipwise-e2e-browsers"
CHROME_VERSION=120.0.6099.109
CHROME_URL="https://storage.googleapis.com/chrome-for-testing-public/$CHROME_VERSION/linux64/chrome-linux64.zip"
FIREFOX_VERSION=140.0esr
FIREFOX_RELEASE="https://archive.mozilla.org/pub/firefox/releases/$FIREFOX_VERSION"
FIREFOX_FILE="linux-x86_64/en-US/firefox-$FIREFOX_VERSION.tar.xz"

if [[ "$(uname -sm)" != "Linux x86_64" ]]; then
  echo "This script downloads Linux x86-64 builds; this machine is $(uname -sm)." >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$DEST"

if [[ -x "$DEST/chrome-120/chrome-linux64/chrome" ]]; then
  echo "Chrome $CHROME_VERSION is already in $DEST/chrome-120"
else
  echo "Downloading Chrome for Testing $CHROME_VERSION…"
  curl -fSL --progress-bar -o "$work/chrome.zip" "$CHROME_URL"
  # Chrome for Testing publishes no checksum file; Google Cloud Storage reports the
  # file's MD5 in the x-goog-hash header.
  expected="$(curl -fsSI "$CHROME_URL" | tr -d '\r' |
    sed -n 's/^x-goog-hash: md5=//Ip')"
  actual="$(openssl dgst -md5 -binary "$work/chrome.zip" | base64)"
  if [[ -z "$expected" || "$expected" != "$actual" ]]; then
    echo "Chrome download does not match its published MD5 ($expected, got $actual)" >&2
    exit 1
  fi
  rm -rf "$DEST/chrome-120"
  unzip -q "$work/chrome.zip" -d "$DEST/chrome-120"
  echo "Chrome: $("$DEST/chrome-120/chrome-linux64/chrome" --version)"
fi

if [[ -x "$DEST/firefox-140/firefox/firefox" ]]; then
  echo "Firefox $FIREFOX_VERSION is already in $DEST/firefox-140"
else
  echo "Downloading Firefox $FIREFOX_VERSION…"
  curl -fSL --progress-bar -o "$work/firefox.tar.xz" "$FIREFOX_RELEASE/$FIREFOX_FILE"
  curl -fsSL -o "$work/SHA256SUMS" "$FIREFOX_RELEASE/SHA256SUMS"
  expected="$(awk -v file="$FIREFOX_FILE" '$2 == file { print $1 }' "$work/SHA256SUMS")"
  actual="$(sha256sum "$work/firefox.tar.xz" | cut -d' ' -f1)"
  if [[ -z "$expected" || "$expected" != "$actual" ]]; then
    echo "Firefox download does not match Mozilla's SHA256SUMS ($expected, got $actual)" >&2
    exit 1
  fi
  rm -rf "$DEST/firefox-140"
  mkdir -p "$DEST/firefox-140"
  tar -xJf "$work/firefox.tar.xz" -C "$DEST/firefox-140"
  # Keeps this copy at 140: no updates, telemetry, or studies.
  mkdir -p "$DEST/firefox-140/firefox/distribution"
  cat >"$DEST/firefox-140/firefox/distribution/policies.json" <<'JSON'
{"policies": {"DisableAppUpdate": true, "DisableTelemetry": true, "DisableFirefoxStudies": true}}
JSON
  echo "Firefox: $("$DEST/firefox-140/firefox/firefox" --version)"
fi

if [[ -x "$DEST/xvfb/usr/bin/Xvfb" ]]; then
  echo "Xvfb is already in $DEST/xvfb"
elif ! command -v apt-get >/dev/null; then
  echo "Skipping Xvfb: it is downloaded with apt-get (Debian or Ubuntu)." >&2
else
  echo "Downloading Xvfb…"
  # apt-get checks the package against the system's signed package lists, and picks
  # the build made for the libraries this system already has. It is unpacked, not
  # installed.
  (cd "$work" && apt-get download xvfb)
  rm -rf "$DEST/xvfb"
  dpkg-deb -x "$work"/xvfb_*.deb "$DEST/xvfb"
  missing="$(ldd "$DEST/xvfb/usr/bin/Xvfb" | sed -n 's/^\s*\(\S*\) => not found$/\1/p')"
  if [[ -n "$missing" ]]; then
    echo "Xvfb needs libraries this system does not have: $missing" >&2
    rm -rf "$DEST/xvfb"
    exit 1
  fi
  # Xvfb compiles its keyboard layout with xkbcomp, which desktop systems have.
  command -v xkbcomp >/dev/null || echo "Xvfb also needs xkbcomp (package x11-xkb-utils)." >&2
  echo "Xvfb: $DEST/xvfb/usr/bin/Xvfb"
fi

echo "Done. Run: pnpm test:e2e:oldest (oldest browsers); pnpm test:e2e includes the desktop tests."
