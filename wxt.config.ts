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
    // Permissions are added in the phase that first needs them; see README.
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
