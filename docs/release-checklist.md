# Release checklist

Work through this list for every release, top to bottom. Nothing in it publishes anything by itself; the store submission at the end is a separate, deliberate step that needs the project owner's explicit approval.

Commands run from the repository root on Linux x86-64 (see the [README](../README.md#requirements) for the tools).

## 1. Decisions to make before the first release

These only need deciding once, before the first submission:

- [x] **Name.** PageNest (chosen on 15 October 2026). It replaces the working name "Recall", which Microsoft uses for a Windows feature, and then "Clipwise", which four Chrome Web Store extensions already used. On 15 October 2026 no extension in the Chrome Web Store or Firefox Add-ons had "PageNest" in its name. The domain pagenest.com is already registered, and no trademark database was checked. Before the first submission, search both stores and a trademark database for "PageNest": both stores forbid names that infringe a trademark or suggest another company's endorsement, and can remove a listing after a trademark complaint. Firefox Add-ons allows names of at most 45 characters.
- [ ] **License.** The repository has none yet. Firefox Add-ons requires a license for listed add-ons ("All rights reserved" is one of the options). Add a `LICENSE` file and choose the same license on the listing.
- [ ] **Contact.** Choose a support email address or website. It goes in `PRIVACY.md` (replace the `TODO(release)` line) and in both store listings.
- [ ] **Privacy policy URL.** The Chrome Web Store requires one, even though PageNest keeps everything on the device. The GitHub repository is private, so `PRIVACY.md` is not reachable there: make the repository public, or publish the policy somewhere public, and note the URL.
- [ ] **Store accounts.** Chrome Web Store: a Google account with 2-Step Verification, a one-time US$5 registration fee (needs the owner's approval), and a trader or non-trader declaration. Firefox Add-ons: a Mozilla account with two-factor authentication, no fee. Details in [publishing.md](publishing.md).
- [ ] **Listing images.** Screenshots at 1280 × 800 and the Chrome Web Store's required 440 × 280 promo tile ([publishing.md](publishing.md#images-to-prepare)).
- [ ] **Firefox add-on ID.** `pagenest@kailash075.github.io` in `wxt.config.ts` becomes permanent once the add-on is submitted. Change it now if it should not contain that name.

## 2. Prepare the code

- [ ] Work on `master`, up to date with GitHub, with no uncommitted changes: `git status`.
- [ ] Set the new version in `package.json` (`version`), for example `0.1.0` → `0.2.0`. WXT copies it into both manifests. A store refuses an upload whose version is not higher than the last one it accepted.
- [ ] Check that no placeholder is left: `git grep -n "TODO(release)" -- ':!docs'` prints nothing.
- [ ] Review what changed since the last release (`git log <last-tag>..HEAD --oneline`). If a permission was added, update the [Permissions](../README.md#permissions) table, `PRIVACY.md`, and the justifications in [publishing.md](publishing.md). If anything now leaves the device, the privacy policy must say so before release.

## 3. Verify

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm check`: typecheck, lint, format, unit tests, both production builds, and Mozilla's linter. Expect 0 errors and exactly the 5 warnings the README lists.
- [ ] `pnpm test:e2e`: every test passes in Chrome and Firefox. The skipped ones only apply to the other browser.
- [ ] `pnpm test:tools` (once per machine), then `pnpm test:e2e:oldest`: every test passes in Chrome 120 and Firefox 140.
- [ ] The real input tests ran rather than being skipped: the `desktop.spec.ts` lines in the output show ✓, not -.
- [ ] Do the [manual checks](../README.md#manual-checks) in the README.
- [ ] Look over the screenshots in `test-results/` (popup and library in light and dark, right-click menus). In Chrome's menus, the PageNest items read "Save page to PageNest" and "Save selection to PageNest", which no test can read there.

## 4. Package

- [ ] `pnpm zip` creates `.output/pagenest-<version>-chrome.zip`.
- [ ] `pnpm zip:firefox` creates `.output/pagenest-<version>-firefox.zip` and `.output/pagenest-<version>-sources.zip`.
- [ ] `pnpm zip:verify` prints "OK": a clean rebuild from the sources zip matches the Firefox package file for file.
- [ ] Check the packages: `unzip -l .output/pagenest-<version>-chrome.zip` lists `manifest.json` at the top level, the icons, and no source maps or test files; the version in each `manifest.json` is the new one.
- [ ] Load each zip's contents in a clean browser profile ([Loading the extension manually](../README.md#loading-the-extension-manually)), save a page, a highlight, and open the library.

## 5. Tag

- [ ] Commit the version change on `master`: `git commit -am "chore: release <version>"`.
- [ ] Tag it: `git tag -a v<version> -m "PageNest <version>"`, then push the commit and the tag.
- [ ] Keep the three zips from `.output/` with the tag (for example as release assets), so the exact uploaded files can be found later.

## 6. Submit (only with the owner's explicit approval)

- [ ] Get explicit approval to publish this version.
- [ ] Chrome Web Store: follow [publishing.md](publishing.md#chrome-web-store).
- [ ] Firefox Add-ons: follow [publishing.md](publishing.md#firefox-add-ons).
- [ ] After approval by each store, install PageNest from the store in a clean profile and repeat the quick check from step 4.
