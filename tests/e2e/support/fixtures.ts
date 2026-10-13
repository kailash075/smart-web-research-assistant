import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test as base } from '@playwright/test';
import { launchChrome } from './chrome';
import { launchFirefox } from './firefox';
import { startTestSite, type TestSite } from './test-site';
import type { BuiltManifest, InstalledExtension, LaunchedExtension } from './types';

export type { ExtensionPage, InstalledExtension, LaunchedExtension } from './types';

type Fixtures = {
  manifest: BuiltManifest;
  /**
   * Starts the browser with the extension installed. Every call within one test uses
   * the same browser profile, so `close()` and launching again simulates a restart.
   */
  launchExtension: () => Promise<LaunchedExtension>;
  /** The extension in a fresh browser profile. */
  extension: InstalledExtension;
  /** A local website with pages to save. */
  site: TestSite;
};

const OUTPUT_DIRS = {
  chromium: resolve('.output/chrome-mv3'),
  firefox: resolve('.output/firefox-mv3'),
} as const;

export const test = base.extend<Fixtures>({
  manifest: async ({ browserName }, use) => {
    await use(readBuiltManifest(outputDirFor(browserName)));
  },

  launchExtension: async ({ browserName, channel, headless, manifest }, use) => {
    const profileDir = createProfileDir(browserName);
    const extensionDir = outputDirFor(browserName);
    const open = new Set<LaunchedExtension>();
    try {
      await use(async () => {
        const options = { extensionDir, profileDir, channel, headless };
        const launched =
          browserName === 'firefox'
            ? await launchFirefox({ ...options, addonId: requireGeckoId(manifest) })
            : await launchChrome(options);
        const tracked: LaunchedExtension = {
          extension: launched.extension,
          close: async () => {
            open.delete(tracked);
            await launched.close();
          },
        };
        open.add(tracked);
        return tracked;
      });
    } finally {
      // Close browsers before deleting the profile they are using.
      for (const launched of [...open]) await launched.close();
      await removeProfileDir(profileDir);
    }
  },

  extension: async ({ launchExtension }, use) => {
    const { extension } = await launchExtension();
    await use(extension);
  },

  site: async ({}, use) => {
    const site = await startTestSite();
    try {
      await use(site);
    } finally {
      await site.close();
    }
  },
});

export { expect } from '@playwright/test';

function requireGeckoId(manifest: BuiltManifest): string {
  if (!manifest.geckoId) {
    throw new Error('Firefox manifest is missing browser_specific_settings.gecko.id');
  }
  return manifest.geckoId;
}

// Snap Firefox cannot read /tmp, so its throwaway profiles live in the snap's own folder.
function createProfileDir(browserName: string): string {
  if (browserName === 'firefox' && existsSync('/snap/bin/firefox')) {
    const dir = join(homedir(), 'snap/firefox/common/recall-e2e-profiles', randomUUID());
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  return mkdtempSync(join(tmpdir(), `recall-e2e-${browserName}-`));
}

// Browser helper processes can still write to the profile for a moment after the
// browser closes, so delete until the folder stays gone.
async function removeProfileDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 10 && existsSync(dir); attempt++) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function outputDirFor(browserName: string): string {
  if (browserName === 'chromium' || browserName === 'firefox') return OUTPUT_DIRS[browserName];
  throw new Error(`Extension tests do not support ${browserName}`);
}

function readBuiltManifest(extensionDir: string): BuiltManifest {
  const manifestPath = resolve(extensionDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${manifestPath} not found. Run \`pnpm test:e2e\`, which builds first.`);
  }
  const raw: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!isRecord(raw) || typeof raw['name'] !== 'string' || typeof raw['version'] !== 'string') {
    throw new Error(`${manifestPath} is missing name or version`);
  }
  const settings = raw['browser_specific_settings'];
  const gecko = isRecord(settings) ? settings['gecko'] : undefined;
  const geckoId = isRecord(gecko) && typeof gecko['id'] === 'string' ? gecko['id'] : undefined;
  return { name: raw['name'], version: raw['version'], geckoId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
