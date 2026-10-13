import { defineConfig } from '@playwright/test';

// End-to-end tests install the production builds from `.output/` into the browsers
// installed on this machine. Run them with `pnpm test:e2e`, which builds both first.
export default defineConfig({
  testDir: 'tests/e2e',
  // Every test launches its own browser with the extension installed.
  workers: 1,
  reporter: [['list']],
  projects: [
    // Google Chrome (/opt/google/chrome on Linux).
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    // Stock Firefox over WebDriver BiDi (/snap/bin/firefox on Linux). Experimental in Playwright.
    { name: 'firefox', use: { browserName: 'firefox', channel: 'moz-firefox' } },
  ],
});
