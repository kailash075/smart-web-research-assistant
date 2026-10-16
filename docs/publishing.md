# Publishing to the stores

How to package PageNest for the Chrome Web Store and Firefox Add-ons (AMO), with text ready to paste into each form. Store requirements were checked against the stores' official documentation in October 2026 (links below); the forms change, so trust the dashboard over this file when they disagree.

**Nothing here may be submitted or published without the project owner's explicit approval.** That includes paying the Chrome Web Store registration fee. Work through the [release checklist](release-checklist.md) first; it produces the files this guide uploads.

## Files

| Store            | Upload                                                 | Made by            |
| ---------------- | ------------------------------------------------------ | ------------------ |
| Chrome Web Store | `.output/pagenest-<version>-chrome.zip`                | `pnpm zip`         |
| Firefox Add-ons  | `.output/pagenest-<version>-firefox.zip`               | `pnpm zip:firefox` |
| Firefox Add-ons  | `.output/pagenest-<version>-sources.zip` (source code) | `pnpm zip:firefox` |

Both extension zips have `manifest.json` at the top level, as the stores require. `pnpm zip:verify` confirms that the sources zip rebuilds the Firefox zip's files exactly.

## Images to prepare

Not part of the repository; make them for the first submission:

| Image            | Size               | Chrome Web Store   | Firefox Add-ons       |
| ---------------- | ------------------ | ------------------ | --------------------- |
| Icon             | 128 × 128 PNG      | Taken from the zip | Taken from the zip    |
| Screenshots      | 1280 × 800 (16:10) | 1 to 5, required   | Optional, recommended |
| Small promo tile | 440 × 280          | Required           | Not used              |
| Marquee promo    | 1400 × 560         | Optional           | Not used              |

Good screenshots: the popup over a web page, right after saving; the library with a few items, a search, and a tag filter; the right-click menu on selected text; the library in the dark colour scheme. The screenshots the tests save in `test-results/` show the same screens and are a starting point, but they contain test data and test browser windows, so take the listing images in a normal browser window.

## Listing text

The name and short description come from the manifest (`wxt.config.ts`).

- **Name:** PageNest. Chrome allows 75 characters, Firefox Add-ons 45.
- **Short description / summary** (77 characters; Chrome allows 132, Firefox Add-ons 250):

  > Save, organize, and search what you find on the web. Local-first and private.

- **Description:**

  > PageNest saves the web pages and passages you want to come back to, and keeps them in a private, searchable library in your browser.
  >
  > Save in one step
  > • Save the page you are reading, or only the text you selected, from the toolbar button, the right-click menu, or a keyboard shortcut (Alt+Shift+D for the page, Alt+Shift+L for the selection, Alt+Shift+M to open PageNest).
  > • Add a note and tags as you save.
  > • Works in the browser's PDF viewer too: right-click the selected text.
  >
  > Find it again
  > • Search titles, addresses, highlights, notes, and tags.
  > • Filter by tag or website, and sort by date.
  > • Edit notes and tags, or delete items.
  > • Export your library to a file, and import it in another browser.
  >
  > Private by design
  > • Everything you save stays in your browser, on your device.
  > • No account, no servers, no analytics, no ads.
  > • PageNest looks at a page only when you use it, and never reads password fields.
  > • The browser itself blocks PageNest's pages from sending anything over the network.

- **Category:** the dashboard's productivity category in the Chrome Web Store, and the closest categories in Firefox Add-ons (up to two, for example Bookmarks). Pick from the lists the dashboards offer.
- **Language:** English.
- **Support:** the contact chosen in the release checklist (email or website). Optional in both stores, but give one.

## Chrome Web Store

Docs: [publish](https://developer.chrome.com/docs/webstore/publish), [prepare](https://developer.chrome.com/docs/webstore/prepare), [images](https://developer.chrome.com/docs/webstore/images), [privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [review](https://developer.chrome.com/docs/webstore/review-process).

### Account (once)

- A Google account with 2-Step Verification turned on; the store requires it before publishing or updating.
- Register at the [developer dashboard](https://chrome.google.com/webstore/devconsole). **This costs a one-time US$5 fee** (a paid service: get the owner's approval first).
- Verify the contact email and set the publisher name shown on the listing.
- Declare whether you are a trader under the EU Digital Services Act. Traders must give a legal name, a phone number, and an address, which are shown publicly on the listing.
- New publishers can have at most two published items.

### Submit

1. **Add new item** and upload `pagenest-<version>-chrome.zip`.
2. **Store listing** tab: description, category, language, screenshots, small promo tile, and (optionally) homepage and support URLs.
3. **Privacy** tab, with the answers below.
4. **Distribution** tab: visibility **Public**, or **Unlisted** (installable only from its link) for a quiet first release. Both get the same review. All regions.
5. **Submit for review.** Untick "publish automatically after review" (deferred publishing) to release by hand once approved; an approved item then has 30 days before it returns to draft.

Review usually takes a few days and can take a few weeks; new developers and new extensions take longer. PageNest has no host permissions, which avoids the slowest reviews.

### Privacy tab answers

**Single purpose:**

> PageNest lets the user save web pages and selected text from pages they visit into a private, searchable library stored in their browser, and find, organize, and export what they saved.

**Permission justifications:**

| Permission     | Justification                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storage`      | Stores the user's saved pages and highlights (address, title, selected text, note, tags, dates) in chrome.storage.local on their device. Nothing is synced or sent anywhere.                                                                                 |
| `activeTab`    | When the user clicks the toolbar button, chooses a PageNest right-click item, or presses a PageNest shortcut, PageNest reads the current tab's address and title to save it. PageNest has no host permissions and cannot see tabs the user has not acted on. |
| `scripting`    | Used only with activeTab, right after the user's action, to run one function in the current tab that reads the text the user selected (and refuses password fields). No script stays in the page.                                                            |
| `contextMenus` | Adds "Save page to PageNest" and "Save selection to PageNest" to the right-click menu on web pages.                                                                                                                                                          |

**Remote code:** "No, I am not using remote code." All code is in the package; the manifest's content security policy allows scripts only from the extension itself (`script-src 'self'`).

**Data usage.** The store requires a disclosure even for data that is only stored on the user's device ([user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), question 3). Tick:

- **Web history**: the address, title, and save time of each page the user chooses to save.
- **Website content**: the text the user selects and saves as a highlight.

Leave the other categories unticked: PageNest handles no personally identifiable, health, financial, authentication, communication, location, or user activity data. Notes and tags the user types are part of the saved items and stay on the device.

Tick all three certifications: PageNest does not sell user data, does not use or transfer it for purposes unrelated to its single purpose, and does not use it for creditworthiness or lending.

**Privacy policy URL:** required, even though nothing leaves the device. Use the public URL of `PRIVACY.md` (see the release checklist); a policy only in the description is a reason for rejection. `PRIVACY.md` includes the Limited Use statement the store asks for.

### Updates

Raise `version` in `package.json`, run the release checklist, then **Package → Upload new package** and submit for review again. Each upload needs a higher version than the last.

## Firefox Add-ons

Docs: [submitting](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/), [add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), [data collection consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/), [third-party libraries](https://extensionworkshop.com/documentation/publish/third-party-library-usage/), [signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/).

### Account (once)

- A Mozilla account with two-factor authentication (required to sign in to the developer hub). No fee.

### Submit

1. In the [developer hub](https://addons.mozilla.org/developers/), **Submit a New Add-on**.
2. Choose **On this site** (listed: public on AMO, with automatic updates). **On your own** gives a signed file to host yourself instead; it is still checked by Mozilla.
3. Upload `pagenest-<version>-firefox.zip`. Choose Firefox (desktop) only: PageNest does not support Firefox for Android.
4. When asked whether the add-on uses a code generator, minifier, or bundler: **Yes**. Upload `pagenest-<version>-sources.zip`.
5. Fill in the listing: name, summary, description, up to two categories, support contact, screenshots, and the **license** (required for listed add-ons; the one chosen in the release checklist).
6. **Privacy policy:** not required, because PageNest transmits no data and its manifest declares `data_collection_permissions: none` (Firefox shows "no data collected" when installing). Adding the text of `PRIVACY.md` is still allowed and helps users.
7. Paste the reviewer notes below into **Notes to Reviewer**, and submit.

Automatic checks and signing take up to a day. Mozilla can also review any version by hand, before or after it is published.

### Notes to reviewer

Update the versions if they change, then paste:

> PageNest is a local-only bookmarking and highlighting extension. It stores what the user saves in storage.local and makes no network requests: the manifest's content security policy for extension pages includes connect-src 'none' and default-src 'self', and there is no remote code.
>
> How to try it: open any web page, click the PageNest toolbar button and choose "Save page"; select some text and use the right-click item "Save selection to PageNest"; then "Open library" in the popup.
>
> Build: the package is bundled and minified with WXT 0.21.4 and Vite 8.3.4. Build instructions are in README.md, section "Build from source (Firefox Add-ons reviewers)": with Node.js 22.13+ and pnpm 11.20.0 (corepack enable), run `pnpm install --frozen-lockfile` then `pnpm build:firefox`; the output in .output/firefox-mv3 is identical to the uploaded package. We built and verified this on Ubuntu 24.04 x86-64 with Node.js 22.23.2 and pnpm 11.20.0 (not on ARM64).
>
> Third-party libraries, unmodified from npm (exact versions in pnpm-lock.yaml): react 19.3.0 and react-dom 19.3.0 (https://www.npmjs.com/package/react, https://www.npmjs.com/package/react-dom), zod 4.6.6 (https://www.npmjs.com/package/zod), and WXT's runtime helpers (https://www.npmjs.com/package/wxt).
>
> Linter warnings: DANGEROUS_EVAL (2) comes from Zod's optional compiled validators; PageNest disables them (z.config({ jitless: true }) in src/schemas/zod.ts) and the CSP would block them anyway. UNSAFE_VAR_ASSIGNMENT (2) is React DOM's internal innerHTML handling; PageNest never sets HTML from data. KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION: PageNest is desktop only and has no gecko_android key on purpose.

### Updates

Raise `version` in `package.json`, run the release checklist, then **Upload New Version** with the new Firefox zip and the matching new sources zip (every version needs its own source code).
