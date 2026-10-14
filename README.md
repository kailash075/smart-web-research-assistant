# Recall

Save, organize, and search what you find on the web. Works offline, stores everything locally, no account and no tracking.

Recall is a cross-browser (Chrome and Firefox, Manifest V3) extension built with [WXT](https://wxt.dev), React, and TypeScript.

> Status: early development. A complete user guide and privacy policy will be added before the first release.

## Using Recall

- **Save a page:** click the Recall toolbar button and choose **Save page**. You can add a note and tags (separated by commas) first. If the page is already saved, the popup says so and the button is disabled. Addresses that differ only by tracking parameters (`utm_*`, `fbclid`, …) or a `#section` link count as the same page.
- **Save a highlight:** select text on the page, then use **Save selection** in the popup. Text selected inside a text box works too. Text in password fields is never read.
- **Right-click:** choose **Save page to Recall**, or **Save selection to Recall** when text is selected. These items only appear on web pages.
- **Keyboard shortcuts** (defaults; change them in `chrome://extensions/shortcuts` or Firefox's **Add-ons → ⚙ → Manage Extension Shortcuts**):

  | Shortcut      | Action                                 |
  | ------------- | -------------------------------------- |
  | `Alt+Shift+M` | Open the Recall popup (**m**enu)       |
  | `Alt+Shift+D` | Save the current page (**d**ocument)   |
  | `Alt+Shift+L` | Save the selected text (high**l**ight) |

  Right-click and shortcut saves show their result on the toolbar button for 4 seconds: a green ✓ for saved, a grey ✓ for already saved, a red ! for a problem. Hover the button to read the message.

  The letters avoid keys that would never reach Recall. Chrome leaves a shortcut unassigned when it uses the keys itself (Chrome 153 on Linux keeps `Alt+Shift` with A, C, I, N, P, R, W, X, and Z). Firefox gives `Alt+Shift` and a letter to the page's access keys first, then to its menu bar (in English, F, E, V, S for History, B, T, and H for Help), and only then to extensions. Wikipedia's access keys use C, E, F, G, H, J, K, O, P, Q, R, T, U, X, and Z. If a page has access keys for M, D, or L, or Firefox's menus use one of those letters in your language, Firefox opens the menu or follows the page's link instead: use the toolbar button or the right-click menu there, or choose other keys.

- **Library:** **Open library** in the popup opens a page listing everything you saved. Search titles, addresses, highlights, notes, and tags (every word must match; case and accents are ignored). Filter by tag or website, sort newest or oldest first, click a tag to filter by it, edit notes and tags, and delete items (Recall asks before deleting).
- **Show in library:** after saving, or on a page you saved before, **Show in library** in the popup opens the library scrolled to that item.
- **Tag suggestions:** the popup and the library's editor offer your most-used tags as one-click buttons.
- **Keyboard:** in the library, press `/` to jump to the search box and `Escape` to clear it. `Escape` also closes the note and tag editor without saving. After closing the editor or cancelling a delete, focus returns to the button you used.
- **Firefox Reader View:** saving a page shown in Reader View saves the article's real address, not the `about:reader` one.

### Import and export

**Export** (top of the library) downloads every readable item as `recall-export-YYYY-MM-DD.json`. It is a plain JSON file you can keep as a backup or move to another browser:

```json
{ "format": "recall-export", "version": 1, "exportedAt": "2026-10-13T09:00:00.000Z", "items": [ … ] }
```

Each item has the same fields as in storage (see [Stored data](#stored-data)). Export uses a normal download link, so it needs no `downloads` permission.

**Import…** reads such a file. Nothing is written until you confirm, and the preview shows what will happen:

- **New items** are added. If an item's id is already used by a different item, it gets a new id.
- **Already saved, unchanged** (same page address, or same highlight text on the same page, with the same title, note, and tags) are skipped.
- **Already saved, but different** are conflicts. By default Recall **keeps the version in your library**. Choosing **Replace it with the version from the file** overwrites the saved title, note, and tags of those items; the saved item keeps its id.
- **Repeated in the file:** only the first copy is used.
- **Entries that cannot be read** (missing fields, unsafe addresses such as `javascript:`, and so on) are skipped, and the preview lists why for the first five.

Everything is written in one storage operation, so a failed import changes nothing. Recall refuses, with a message and without changing anything, files that are not JSON, JSON that is not a Recall export, files from a newer version of Recall, damaged files, files over 25 MB, and files with more than 50,000 items.

Chrome limits local extension storage to about 10 MB (several thousand items with notes and highlights). If an import does not fit, Recall reports that storage is full and writes nothing. Firefox has no such fixed limit.

Recall cannot save browser pages (settings, new tab, extension pages), add-on stores, or local files. PDFs in the browser's built-in viewer do not let extensions read the selection from the popup; right-click the selection and choose **Save selection to Recall** instead, which works because the browser passes the selected text to Recall directly (tested in Firefox; check Chrome by hand).

## Permissions

Recall asks for as little as possible. Each permission is listed here with the reason it is needed. None of them shows a warning when the extension is installed, and Recall has no host permissions, so it cannot read any page you have not acted on.

| Permission     | Why                                                                                                                                                                                                                                              | Install warning |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `storage`      | Keeps your saved pages and highlights in the browser's local extension storage on this device.                                                                                                                                                   | None            |
| `activeTab`    | Lets Recall see the address and title of the current tab, and read its selected text, only right after you click the toolbar button, choose a Recall menu item, or press a Recall shortcut. The access ends when you leave the page or close it. | None            |
| `scripting`    | Runs one small function in the current tab to read the text you selected (allowed only through `activeTab`, so only after your action). Nothing stays in the page.                                                                               | None            |
| `contextMenus` | Adds **Save page to Recall** and **Save selection to Recall** to the right-click menu.                                                                                                                                                           | None            |

Keyboard shortcuts (`commands` in the manifest) and the toolbar badge need no permission. More permissions are added only when a feature needs them, and documented here.

## Browser support

| Browser           | Minimum version | Tested on Linux x86-64                                         |
| ----------------- | --------------- | -------------------------------------------------------------- |
| Chrome (desktop)  | 120             | Google Chrome 153.0.8010.36, Chrome for Testing 120.0.6099.109 |
| Firefox (desktop) | 140 (ESR)       | Firefox 156.0.1, Firefox ESR 140.0esr                          |

- **Minimums.** The manifest sets them (`minimum_chrome_version`, and `strict_min_version` for Firefox), so older browsers refuse to install Recall. Firefox 140 is an extended support release and the first that reads `data_collection_permissions`, which Firefox Add-ons requires. TypeScript only allows JavaScript built-ins up to ES2023 (`lib` in `tsconfig.json`), so code that needs a newer browser fails to type-check.
- **Desktop only.** Firefox for Android has neither right-click menus nor extension shortcuts, and Recall is untested there. The manifest leaves out `gecko_android`, so Firefox Add-ons does not offer Recall for Android. Because of that, `pnpm lint:firefox` warns `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`; the warning is expected.
- **Not tested:** Windows, macOS, other Chromium browsers (Edge, Brave, and so on), and Safari.

Where the two browsers differ:

- **Background.** Chrome runs Recall's background as a service worker, Firefox as an event page. Both stop it when idle and start it again for the next menu click or shortcut. Recall keeps nothing in memory between events, and the tests check that a stopped background wakes up (in Firefox).
- **Keyboard shortcuts.** Chrome does not assign a suggested shortcut that it uses itself, and the keys it keeps differ by version (Chrome 153 keeps `Alt+Shift+R`, Chrome 120 does not). Firefox assigns any shortcut, but pages' access keys and its menu bar take `Alt+Shift` and a letter first (see [Using Recall](#using-recall)).
- **PDF viewer.** In Chrome 120, a right-click in the PDF viewer reports the viewer rather than the tab (no tab ID, and the viewer's own address). Recall then saves the PDF's address and shows the result on the active tab. Chrome 153 reports the tab.
- **Reader View** exists only in Firefox, and Recall saves the article's real address there.
- **Storage.** Chrome limits local extension storage to about 10 MB; Firefox has no fixed limit.

### Testing the oldest supported versions

```bash
pnpm test:tools        # downloads Chrome for Testing 120, Firefox ESR 140, and Xvfb (Linux x86-64)
pnpm test:e2e:oldest   # builds, then runs the end-to-end tests in those two browsers
```

`scripts/get-test-tools.sh` saves both browsers in `~/.cache/recall-e2e-browsers`, checks them against the checksums Google and Mozilla publish, and turns off updates in that Firefox. It also unpacks Xvfb there for the [real input tests](#real-keys-and-menus). Nothing is installed system-wide. The `chrome-120` and `firefox-140` test projects exist only when those files are there.

- **Firefox 140** runs every test. Playwright cannot drive Firefox 140 (its WebDriver BiDi client sends `network.addDataCollector`, which Firefox 140 does not have), so the tests start that Firefox themselves and open and script web pages through Firefox's remote debugging protocol instead.
- **Chrome 120** runs every test except those that click the toolbar button through the DevTools protocol: Chrome 120's protocol has no `Extensions.triggerAction`, so they are skipped there and run on current Chrome. The real input tests open its popup with `Alt+Shift+M` instead.

## Requirements

- Node.js 22.13 or newer
- pnpm 11

## Setup

```bash
pnpm install
```

`pnpm install` runs `wxt prepare`, which generates `.wxt/` (TypeScript types and the base `tsconfig`). pnpm 11 does not rerun it after `pnpm add`, so run `pnpm wxt prepare` yourself if types look stale after adding a package.

## Commands

| Command                | What it does                                                                |
| ---------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`             | Dev mode for Chrome with hot reload (`.output/chrome-mv3-dev`)              |
| `pnpm dev:firefox`     | Dev mode for Firefox (`.output/firefox-mv3-dev`)                            |
| `pnpm build`           | Production build for Chrome (`.output/chrome-mv3`)                          |
| `pnpm build:firefox`   | Production build for Firefox (`.output/firefox-mv3`)                        |
| `pnpm zip`             | Store-ready zip for Chrome                                                  |
| `pnpm zip:firefox`     | Store-ready zip for Firefox, plus the sources zip reviewers rebuild it from |
| `pnpm typecheck`       | TypeScript check                                                            |
| `pnpm lint`            | ESLint                                                                      |
| `pnpm lint:firefox`    | Mozilla's add-on linter on the Firefox production build                     |
| `pnpm format`          | Format with Prettier                                                        |
| `pnpm test`            | Unit tests (Vitest)                                                         |
| `pnpm test:e2e`        | Builds both targets, then browser tests in Chrome and Firefox               |
| `pnpm test:tools`      | Downloads the oldest supported Chrome and Firefox, and Xvfb, for testing    |
| `pnpm test:e2e:oldest` | Builds both targets, then browser tests in Chrome 120 and Firefox 140       |
| `pnpm check`           | Typecheck, lint, format, unit tests, builds, Firefox lint                   |

The sources zip holds only what the build needs (`zip.includeSources` in `wxt.config.ts`), so local files such as test results never end up in it. Rebuilding from it gives a Firefox build identical to `.output/firefox-mv3`.

`pnpm lint:firefox` reports no errors and 5 warnings, all expected:

- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`: Recall is desktop only (see [Browser support](#browser-support)).
- 2 × `DANGEROUS_EVAL`, in Zod: its optional compiled validators. Recall turns them off (`jitless` in `src/schemas/zod.ts`), and the Manifest V3 content security policy would block them anyway.
- 2 × `UNSAFE_VAR_ASSIGNMENT`, in React DOM: its own internal `innerHTML` use. Recall never sets HTML from data.

## End-to-end tests

`pnpm test:e2e` builds both targets and runs [Playwright](https://playwright.dev) tests against the browsers installed on this machine, headless. Add `--headed` to watch them, or `--project chrome` / `--project firefox` to run one browser.

- **Chrome** uses your installed Google Chrome. Chrome 137+ ignores `--load-extension`, so the tests install the build through the DevTools protocol (`Extensions.loadUnpacked`), the same way web-ext does.
- **Firefox** uses your installed Firefox through Playwright's experimental `moz-firefox` channel (WebDriver BiDi). WebDriver cannot install extensions or script, click, or type in `moz-extension://` pages, so the tests use Firefox's remote debugging protocol for those steps (`tests/e2e/support/firefox-remote.ts`). On Ubuntu's snap Firefox, test profiles are created in `~/snap/firefox/common/recall-e2e-profiles/` and deleted afterwards.

The tests save real pages from a small local website (`tests/e2e/support/test-site.ts`), including a PDF, so they need no network. The toolbar button is clicked the way a user would click it, so the browser grants `activeTab` and opens the real popup: Chrome through `Extensions.triggerAction`, Firefox through its browser process. In Firefox the tests also run Recall's keyboard shortcuts and choose its right-click menu items through the browser process. Pages Recall cannot save (browser pages, local files) and the PDF viewer are covered in `special-pages.spec.ts`. Real key presses and right-click menus, in both browsers, are in `desktop.spec.ts` ([below](#real-keys-and-menus)).

Most tests read and change extension pages by running code inside them (`tests/e2e/support/dom.ts`). Tests that check what a person does with the mouse and keyboard use real input instead (`page.user` in `tests/e2e/support/types.ts`): trusted events that go through the browser and can open its file chooser.

- **Chrome:** Playwright's mouse and keyboard, and its file chooser handling.
- **Firefox:** native mouse events and `nsITextInputProcessor` keys sent from the browser process. A stand-in for Firefox's file picker component picks the test file when the page opens the chooser, and the test fails if the chooser never opens.

Import and export are covered in `backup.spec.ts`:

- Export clicked with the mouse saves a real download, and the browser's own download list records it as finished (`chrome://downloads`, or Firefox's Library).
- **Import…** clicked with the mouse opens the file chooser and restores deleted items.
- An older backup keeps newer edits by default, and replaces them only when **Replace** is chosen.
- Also covered: refused files, and the duplicate and conflict counts.

`usability.spec.ts` covers:

- `/`, typing, `Escape` and `Backspace` with real keys.
- Focus after editing and deleting.
- Tag suggestions.
- **Show in library**: the library scrolls to an older item, outlines it in the accent colour, and focuses it.
- Reader View (Firefox only).

The storage tests include a restart check: the test saves a record, closes the browser completely, starts it again on the same profile, and confirms the popup still reads the record.

`lifecycle.spec.ts` covers:

- Every keyboard shortcut is assigned (`commands.getAll()`), and Chrome's `chrome://extensions/shortcuts` page shows them. Chrome leaves a shortcut empty when it uses the keys itself.
- Firefox: none of Firefox's own shortcuts or menu bar letters uses Recall's keys.
- Firefox: after the background is stopped, a shortcut and a right-click menu item wake it and save.
- An update (a copy of the build with a higher version, reloaded) keeps the library, the right-click items, and the shortcuts.
- An update from a build with the earlier shortcuts (`Alt+Shift+R`, `S`, `H`) assigns the current ones. Chrome 120 keeps the earlier key for opening Recall; Chrome 153 and Firefox move all three. Recall was never published with the earlier keys.

`appearance.spec.ts` opens the popup and the library in the light and dark colour schemes, checks that they follow the scheme and do not scroll sideways, and saves screenshots in `test-results/` to look over.

In Firefox, keys that the tests send to a page through the browser never reach extension shortcuts, although a person's key presses do. So `pressShortcut` runs the shortcut's command, as the keys would, and `desktop.spec.ts` presses the real keys.

### Real keys and menus

Browsers ignore extension shortcuts and cannot open their native right-click menus when the input comes from Chrome's DevTools protocol or from keys a test sends through Firefox. So `desktop.spec.ts` starts the browser with a visible window on a private virtual display (Xvfb) and sends key presses and clicks through the X server (XTest), as a person's input arrives (`tests/e2e/support/virtual-display.ts` and `x11-input.py`). Nothing appears on your screen. It finds Recall's items in a menu by looking for Recall's icon inside the menu's window, and saves a screenshot of each menu in `test-results/desktop-…/`.

The tests are skipped when Xvfb is missing: `pnpm test:tools` downloads it on Debian and Ubuntu (with `apt-get download`, without installing it). They also need `python3` and the system's `libX11` and `libXtst`, which desktop Ubuntu has. They run in all four test browsers and cover:

- `Alt+Shift+M` opens the popup. `Alt+Shift+D` saves the page, and pressing it again reports that the page was already saved. `Alt+Shift+L` saves the selection, or asks for one when nothing is selected.
- Right-click a page: one Recall item, which saves the page (twice: saved, then already saved). With text selected: one Recall item, which saves the selection.
- No Recall items on a `file://` page, nor on `chrome://extensions` in Chrome.
- Chrome's PDF viewer: select all, open the menu with `Shift+F10`, and **Save selection to Recall** saves the PDF's text, title, and address. (Firefox's PDF viewer is a web page, covered in `special-pages.spec.ts`.)
- Access keys: Recall's shortcuts work on a page with Wikipedia's access keys. On a page whose access keys are Recall's letters, Firefox gives the keys to the page and Chrome gives them to Recall.

### Manual checks

Before a release, check what the tests do not:

1. Look at the toolbar badge in both browsers after a save: a green ✓ for saved, a grey ✓ for already saved, a red ! for a problem. The tests read the badge's text and tooltip, not its colour.
2. In **Firefox on Windows**, press `Alt+Shift+D` on a web page, then select text and press `Alt+Shift+L`: both save, and no Firefox menu opens. The tests run on Linux only. There, real key presses showed that Firefox opens its History menu for `Alt+Shift+S` and its Help menu for `Alt+Shift+H`, the keys Recall used before.

## Architecture

Code is split into layers. Each layer may only import from the layers listed before it, and ESLint (`no-restricted-imports`) fails the build if that rule is broken.

| Folder               | Contains                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/shared`         | Small helpers with no app knowledge (`Result`)                                                        |
| `src/domain`         | Research item types and pure rules: validation, URLs, tags, duplicates, search, import merging        |
| `src/schemas`        | Zod schemas that check data coming from storage or imported files                                     |
| `src/application`    | Use cases (save, edit, delete, import, export) and the interfaces they need (`ResearchRepository`, …) |
| `src/infrastructure` | Browser-specific implementations: the `browser.storage` repository and tab/selection access           |
| `src/composition`    | Builds the real implementations and hands them to the UI                                              |
| `src/ui`             | React context, hooks, and components                                                                  |
| `src/entrypoints`    | WXT entry points (popup, library page, background) that wire everything together                      |

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
