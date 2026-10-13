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
    // "Manage Extension Shortcuts". Using one also grants activeTab.
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Open Recall',
      },
      'save-page': {
        suggested_key: { default: 'Alt+Shift+S' },
        description: 'Save the current page',
      },
      'save-selection': {
        suggested_key: { default: 'Alt+Shift+H' },
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
            // Firefox for Android only supports data_collection_permissions from 142.
            gecko_android: { strict_min_version: '142.0' },
          },
        }
      : { minimum_chrome_version: '120' }),
  }),
});
