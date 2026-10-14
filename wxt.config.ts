import { defineConfig } from 'wxt';

const FIREFOX_ADDON_ID = 'recall@kailash075.github.io';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Explicit imports keep dependencies visible and let ESLint enforce layer boundaries.
  imports: false,
  // WXT defaults Firefox to MV2; we target MV3 in both browsers.
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'Recall',
    description: 'Save, organize, and search what you find on the web. Local-first and private.',
    // Each permission is explained in the README. None shows an install warning.
    // storage: keep research in browser.storage.local on this device.
    // activeTab: read the URL and title of the tab the user acts on, only at that moment.
    // scripting: read the selected text in that tab (allowed by activeTab).
    // contextMenus: the "Save page/selection to Recall" right-click items.
    permissions: ['storage', 'activeTab', 'scripting', 'contextMenus'],
    // Users can change these in chrome://extensions/shortcuts or Firefox's
    // "Manage Extension Shortcuts". Using one also grants activeTab. The letters avoid
    // keys that would never reach Recall:
    // - Chrome leaves a shortcut unassigned when it uses the keys itself. Chrome 153 on
    //   Linux takes Alt+Shift+A, C, I, N, P, R, W, X, and Z.
    // - In Firefox, Alt+Shift and a menu bar letter opens that menu. In English those
    //   are F, E, V, S, B, T, and H.
    // - In Firefox, a page's access keys (also Alt+Shift and a letter) win. Wikipedia
    //   uses C, E, F, G, H, J, K, O, P, Q, R, T, U, X, and Z.
    // tests/e2e/lifecycle.spec.ts and tests/e2e/desktop.spec.ts check this.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Open Recall',
      },
      'save-page': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Save the current page',
      },
      'save-selection': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: 'Save the selected text',
      },
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: FIREFOX_ADDON_ID,
              strict_min_version: '140.0',
              // Declares to Mozilla that the extension collects no user data.
              data_collection_permissions: { required: ['none'] },
            },
            // No `gecko_android` key: it would list Recall for Firefox for Android on AMO,
            // where it is untested and the contextMenus and commands APIs do not exist.
          },
        }
      : { minimum_chrome_version: '120' }),
  }),
  zip: {
    // The sources zip that Firefox Add-ons reviewers rebuild the extension from. Only
    // what the build needs, so local files (test results, notes) never end up in it.
    includeSources: [
      'src/**',
      'public/**',
      'package.json',
      'pnpm-lock.yaml',
      'tsconfig.json',
      'wxt.config.ts',
      'README.md',
    ],
  },
});
