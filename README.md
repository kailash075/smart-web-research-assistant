# Recall

Save, organize, and search what you find on the web. Works offline, stores everything locally, no account and no tracking.

Recall is a cross-browser (Chrome and Firefox, Manifest V3) extension built with [WXT](https://wxt.dev), React, and TypeScript.

> Status: early development. A complete user guide and privacy policy will be added before the first release.

## Permissions

Recall asks for as little as possible. Each permission is listed here with the reason it is needed.

| Permission | Why                                                                                            | Install warning |
| ---------- | ---------------------------------------------------------------------------------------------- | --------------- |
| `storage`  | Keeps your saved pages and highlights in the browser's local extension storage on this device. | None            |

More permissions are added only when a feature needs them, and documented here.

## Requirements

- Node.js 22.13 or newer
- pnpm 11

## Setup

```bash
pnpm install
```

`pnpm install` runs `wxt prepare`, which generates `.wxt/` (TypeScript types and the base `tsconfig`). pnpm 11 does not rerun it after `pnpm add`, so run `pnpm wxt prepare` yourself if types look stale after adding a package.

## Commands

| Command              | What it does                                                   |
| -------------------- | -------------------------------------------------------------- |
| `pnpm dev`           | Dev mode for Chrome with hot reload (`.output/chrome-mv3-dev`) |
| `pnpm dev:firefox`   | Dev mode for Firefox (`.output/firefox-mv3-dev`)               |
| `pnpm build`         | Production build for Chrome (`.output/chrome-mv3`)             |
| `pnpm build:firefox` | Production build for Firefox (`.output/firefox-mv3`)           |
| `pnpm zip`           | Store-ready zip for Chrome                                     |
| `pnpm zip:firefox`   | Store-ready zip (plus source zip) for Firefox                  |
| `pnpm typecheck`     | TypeScript check                                               |
| `pnpm lint`          | ESLint                                                         |
| `pnpm lint:firefox`  | Mozilla's add-on linter on the Firefox production build        |
| `pnpm format`        | Format with Prettier                                           |
| `pnpm test`          | Unit tests (Vitest)                                            |
| `pnpm test:e2e`      | Builds both targets, then browser tests in Chrome and Firefox  |
| `pnpm check`         | Typecheck, lint, format, unit tests, builds, Firefox lint      |

## End-to-end tests

`pnpm test:e2e` builds both targets and runs [Playwright](https://playwright.dev) tests against the browsers installed on this machine, headless. Add `--headed` to watch them, or `--project chrome` / `--project firefox` to run one browser.

- **Chrome** uses your installed Google Chrome. Chrome 137+ ignores `--load-extension`, so the tests install the build through the DevTools protocol (`Extensions.loadUnpacked`), the same way web-ext does.
- **Firefox** uses your installed Firefox through Playwright's experimental `moz-firefox` channel (WebDriver BiDi). WebDriver cannot install extensions or read `moz-extension://` pages, so the tests use Firefox's remote debugging protocol for those steps (`tests/e2e/support/firefox-remote.ts`). Firefox tests therefore check page content by running code inside the page rather than by clicking and typing. On Ubuntu's snap Firefox, test profiles are created in `~/snap/firefox/common/recall-e2e-profiles/` and deleted afterwards.

The storage tests include a restart check: the test saves a record, closes the browser completely, starts it again on the same profile, and confirms the popup still reads the record.

## Architecture

Code is split into layers. Each layer may only import from the layers listed before it, and ESLint (`no-restricted-imports`) fails the build if that rule is broken.

| Folder               | Contains                                                                   |
| -------------------- | -------------------------------------------------------------------------- |
| `src/shared`         | Small helpers with no app knowledge (`Result`)                             |
| `src/domain`         | Research item types and pure rules: validation, URLs, tags, duplicates     |
| `src/schemas`        | Zod schemas that check data coming from storage or imported files          |
| `src/application`    | Use cases and the interfaces they need (`ResearchRepository`)              |
| `src/infrastructure` | Browser-specific implementations, such as the `browser.storage` repository |
| `src/composition`    | Builds the real implementations and hands them to the UI                   |
| `src/ui`             | React context, hooks, and components                                       |
| `src/entrypoints`    | WXT entry points (popup, background) that wire everything together         |

React code never touches `browser.storage` directly (also enforced by ESLint); it calls use cases through `useAppServices()`. Future cloud sync or AI features plug in as new implementations of application interfaces, without changing the domain.

### Stored data

Research lives in `browser.storage.local` on this device. Nothing is sent anywhere.

| Key                  | Value                                      |
| -------------------- | ------------------------------------------ |
| `meta:schemaVersion` | Storage format version (currently `1`)     |
| `item:<id>`          | One saved page or highlight, as plain JSON |

- One key per item means two open extension pages editing different items never overwrite each other.
- Every read is validated with Zod. A damaged record is skipped (and counted) instead of breaking the whole library.
- If the format version is newer than this build understands (for example after installing an older version), Recall refuses to read or write rather than risk corrupting your data.
- Zod runs in "jitless" mode because extension pages forbid `eval`. Mozilla's linter still reports `DANGEROUS_EVAL` for Zod's bundled code, but that code path is never executed.

## Loading the extension manually

### Chrome (Linux)

1. Run `pnpm build` (or `pnpm dev`, which rebuilds on save).
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose `.output/chrome-mv3` (or `.output/chrome-mv3-dev` in dev mode).
4. Pin Recall from the puzzle-piece menu and click its icon.

`pnpm dev` normally does this for you: it opens a separate Chrome window with the extension already installed (verified with Google Chrome 153; web-ext 10 loads it through Chrome's debugging pipe because branded Chrome 137+ ignores `--load-extension`). Use the manual steps when you want the extension in your everyday profile.

### Firefox (Linux)

1. Run `pnpm build:firefox` (or `pnpm dev:firefox`).
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and choose `manifest.json` inside `.output/firefox-mv3` (or `.output/firefox-mv3-dev`).

Temporary add-ons are removed when Firefox restarts, so load the extension again after a restart.

#### Snap Firefox (Ubuntu default)

`pnpm dev:firefox` launches Firefox through web-ext, which puts a throwaway profile in `/tmp`. Snap Firefox cannot read the real `/tmp`, so it closes immediately. Fix it with a git-ignored `web-ext.config.ts` in the project root that uses a persistent profile inside the snap's own folder. Persistent profiles also let you check that saved research survives a browser restart:

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineWebExtConfig } from 'wxt';

export default defineWebExtConfig({
  firefoxProfile: join(homedir(), 'snap/firefox/common/recall-dev-profile'),
  keepProfileChanges: true,
  // Keep the temporary add-on's storage between sessions, like a signed install.
  firefoxPref: {
    'extensions.webextensions.keepStorageOnUninstall': true,
    'extensions.webextensions.keepUuidOnUninstall': true,
  },
  // Optional: reuse one Chrome profile for `pnpm dev` instead of a fresh one each run.
  chromiumArgs: [`--user-data-dir=${join(homedir(), '.cache/recall-dev-chrome-profile')}`],
});
```

Create the folder once with `mkdir -p ~/snap/firefox/common/recall-dev-profile`. When you stop dev mode with Ctrl+C, web-ext cannot close a snap Firefox (`kill EACCES`), so close that Firefox window yourself.

## Inspecting errors

- **Chrome background:** `chrome://extensions` → Recall → **Inspect views: service worker**. The **Errors** button lists recent errors.
- **Chrome popup:** open the popup, right-click inside it → **Inspect**.
- **Firefox background and popup:** `about:debugging#/runtime/this-firefox` → Recall → **Inspect**. To keep the popup open while inspecting, use the toolbox `…` menu → **Disable Popup Auto-Hide**.
- **Scripts injected into web pages:** the page's own DevTools console (F12).
