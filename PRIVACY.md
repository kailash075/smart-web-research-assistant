# Clipwise privacy policy

Last updated: 14 October 2026

Clipwise is a browser extension for saving web pages and highlights. Everything you save stays in your browser, on your device. Clipwise has no servers and no accounts, it shows no ads, and it never sends your data anywhere.

## What Clipwise stores

Clipwise stores something only when you ask it to: when you click **Save page** or **Save selection** in its popup, choose **Save page to Clipwise** or **Save selection to Clipwise** in the right-click menu, or press one of its keyboard shortcuts. For each item it stores:

- the address (URL) and title of the page;
- for a highlight, the text you selected;
- the note and tags you typed, if any;
- when you saved the item and when you last edited it.

Clipwise keeps these items in the browser's local storage for extensions (`storage.local`), inside your browser profile on this device. The browser does not sync this storage to other devices or to your Google or Mozilla account.

## What Clipwise reads, and when

Clipwise can only look at a tab right after you act on it (the `activeTab` permission): when you click its toolbar button, choose one of its right-click items, or press one of its shortcuts. It then reads the tab's address and title and, to save a highlight, the text you selected. That access ends when you leave or close the page.

Clipwise never reads:

- text in password fields, even when it is selected;
- the rest of the page beyond your selection;
- your browsing history, bookmarks, cookies, or other tabs;
- pages you have not acted on. Clipwise has no permission to run on websites by itself.

The [README](README.md#permissions) explains each permission Clipwise asks for.

## What Clipwise sends

Nothing. Clipwise makes no network requests:

- no analytics, telemetry, crash reports, or advertising;
- no third-party services or code loaded from the internet.

The browser enforces this. Clipwise's manifest gives its own pages a content security policy (`connect-src 'none'`) under which the browser refuses any network request they make. Clipwise's automated tests check that a request from its pages never arrives. In Firefox, Clipwise declares that it collects no data (`data_collection_permissions: none`).

Clipwise does not sell, share, or transfer your data to anyone. Clipwise's use of information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.

## Export and import

**Export** in the library saves a file with all your items to your computer, through your browser's normal download. **Import…** reads a file that you choose. Clipwise does nothing else with these files; where you keep or send them is up to you.

## Your control over your data

- Edit or delete any item in the library.
- Export your items at any time.
- Uninstalling Clipwise makes the browser delete everything Clipwise stored. Export first if you want to keep your research.

## Future features

Future versions may offer features that need a server, such as AI summaries, semantic search, or sync across devices. Any such feature will be optional and off until you turn it on, and will tell you what it sends and where before it sends anything. This policy will be updated before such a version is released. No current version of Clipwise includes them.

## Changes to this policy

Changes are published in this file, with a new "Last updated" date.

## Contact

TODO(release): add a support email address or website for privacy questions.
