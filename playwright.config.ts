import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, type Project } from '@playwright/test';

// The oldest versions Recall supports (minimum_chrome_version and strict_min_version in
// wxt.config.ts). `scripts/get-test-tools.sh` downloads them here.
const OLDEST = join(homedir(), '.cache/recall-e2e-browsers');
const CHROME_120 = join(OLDEST, 'chrome-120/chrome-linux64/chrome');
const FIREFOX_140 = join(OLDEST, 'firefox-140/firefox/firefox');

const oldestBrowsers: Project[] = [
  ...(existsSync(CHROME_120)
    ? [
        {
          name: 'chrome-120',
          use: { browserName: 'chromium' as const, launchOptions: { executablePath: CHROME_120 } },
        },
      ]
    : []),
  ...(existsSync(FIREFOX_140)
    ? [
        {
          name: 'firefox-140',
          use: {
            browserName: 'firefox' as const,
            channel: 'moz-firefox',
            launchOptions: { executablePath: FIREFOX_140 },
          },
        },
      ]
    : []),
];

// End-to-end tests install the production builds from `.output/` into the browsers
// installed on this machine. Run them with `pnpm test:e2e`, which builds both first.
export default defineConfig({
  testDir: 'tests/e2e',
  // Every test launches its own browser with the extension installed.
  workers: 1,
  // Starting and closing a browser takes a few seconds, and Firefox tests send real
  // input through the debugger protocol, one round trip at a time.
  timeout: 60_000,
  reporter: [['list']],
  projects: [
    // Google Chrome (/opt/google/chrome on Linux).
    { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome' } },
    // Stock Firefox over WebDriver BiDi (/snap/bin/firefox on Linux). Experimental in Playwright.
    { name: 'firefox', use: { browserName: 'firefox', channel: 'moz-firefox' } },
    // Run with `pnpm test:e2e:oldest`.
    ...oldestBrowsers,
  ],
});
