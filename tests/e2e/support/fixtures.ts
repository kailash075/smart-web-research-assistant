import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test as base, chromium, firefox, type BrowserContext, type Page } from '@playwright/test';
import {
  connectFirefoxDebugger,
  debugExtension,
  evaluateToString,
  getAddon,
  installTemporaryAddon,
  type ExtensionDebugSession,
  type FirefoxDebugger,
} from './firefox-remote';
import { findFreePort } from './ports';

type BuiltManifest = {
  name: string;
  version: string;
  geckoId: string | undefined;
};

/** A page of the extension, opened in a normal tab. */
export type ExtensionPage = {
  /** Runs a synchronous, JSON-serialisable function inside the page. */
  evaluate: <T>(fn: () => T) => Promise<T>;
  /** Uncaught errors and console.error calls from the extension so far. */
  errors: () => string[];
};

export type InstalledExtension = {
  isBackgroundRunning: () => Promise<boolean>;
  openPage: (path: string) => Promise<ExtensionPage>;
};

type Fixtures = {
  manifest: BuiltManifest;
  extension: InstalledExtension;
};

const OUTPUT_DIRS = {
  chromium: resolve('.output/chrome-mv3'),
  firefox: resolve('.output/firefox-mv3'),
} as const;

export const test = base.extend<Fixtures>({
  manifest: async ({ browserName }, use) => {
    await use(readBuiltManifest(outputDirFor(browserName)));
  },

  extension: async ({ browserName, channel, headless, manifest }, use) => {
    const extensionDir = outputDirFor(browserName);
    const { extension, close } =
      browserName === 'firefox'
        ? await launchFirefox({ extensionDir, manifest, channel, headless })
        : await launchChrome({ extensionDir, channel, headless });
    try {
      await use(extension);
    } finally {
      await close();
    }
  },
});

export { expect } from '@playwright/test';

type LaunchOptions = {
  extensionDir: string;
  channel: string | undefined;
  headless: boolean;
};

type Launched = { extension: InstalledExtension; close: () => Promise<void> };

// Branded Chrome 137+ ignores --load-extension, so we install through the DevTools
// protocol instead (the same method web-ext uses). Playwright disables extensions by
// default, so that flag is removed.
async function launchChrome({ extensionDir, channel, headless }: LaunchOptions): Promise<Launched> {
  const context = await chromium.launchPersistentContext('', {
    ...(channel ? { channel } : {}),
    headless,
    args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Chrome browser handle is unavailable');
  const session = await browser.newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: extensionDir });
  const isOurWorker = (url: string) => url.startsWith(`chrome-extension://${id}/`);

  const errors: string[] = [];
  const extension: InstalledExtension = {
    isBackgroundRunning: async () => {
      if (context.serviceWorkers().some((worker) => isOurWorker(worker.url()))) return true;
      await context.waitForEvent('serviceworker', {
        predicate: (worker) => isOurWorker(worker.url()),
      });
      return true;
    },
    openPage: async (path) => {
      const page = await context.newPage();
      collectErrors(page, errors);
      await page.goto(`chrome-extension://${id}/${path}`);
      return {
        evaluate: (fn) => page.evaluate(fn),
        errors: () => [...errors],
      };
    },
  };
  return { extension, close: () => context.close() };
}

// Playwright drives the installed Firefox over WebDriver BiDi (channel "moz-firefox").
// Installing the add-on and reading its pages go through Firefox's debugger protocol.
async function launchFirefox({
  extensionDir,
  manifest,
  channel,
  headless,
}: LaunchOptions & { manifest: BuiltManifest }): Promise<Launched> {
  const addonId = manifest.geckoId;
  if (!addonId) throw new Error('Firefox manifest is missing browser_specific_settings.gecko.id');

  const profileDir = createFirefoxProfileDir();
  const debuggerPort = await findFreePort();
  let context: BrowserContext | undefined;
  let client: FirefoxDebugger | undefined;
  const close = async () => {
    client?.close();
    await context?.close();
    rmSync(profileDir, { recursive: true, force: true });
  };

  try {
    context = await firefox.launchPersistentContext(profileDir, {
      ...(channel ? { channel } : {}),
      headless,
      args: [`--start-debugger-server=${String(debuggerPort)}`],
      firefoxUserPrefs: {
        'devtools.debugger.remote-enabled': true,
        'devtools.debugger.prompt-connection': false,
        'devtools.chrome.enabled': true,
      },
    });
    const debuggerClient = await connectFirefoxDebugger(debuggerPort);
    client = debuggerClient;
    const installedId = await installTemporaryAddon(debuggerClient, extensionDir);
    if (installedId !== addonId) throw new Error(`Installed ${installedId}, expected ${addonId}`);
    const addon = await getAddon(debuggerClient, addonId);
    const session = await debugExtension(debuggerClient, String(addon['actor']));

    const extension: InstalledExtension = {
      isBackgroundRunning: async () =>
        (await getAddon(debuggerClient, addonId))['backgroundScriptStatus'] === 'RUNNING',
      openPage: (path) => openFirefoxExtensionPage(debuggerClient, session, path),
    };
    return { extension, close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function openFirefoxExtensionPage(
  client: FirefoxDebugger,
  session: ExtensionDebugSession,
  path: string,
): Promise<ExtensionPage> {
  const pageAppeared = session.waitForPage(`/${path}`);
  // Extension pages cannot be opened by WebDriver, so the extension opens its own tab.
  await evaluateToString(
    client,
    session.backgroundConsole,
    `browser.tabs.create({ url: ${JSON.stringify(`/${path}`)} }), 'ok'`,
  );
  const consoleActor = await pageAppeared;
  await waitUntil(async () => {
    const state = await evaluateToString(client, consoleActor, 'document.readyState');
    return state === 'complete';
  });
  return {
    evaluate: async <T>(fn: () => T) => {
      const json = await evaluateToString(
        client,
        consoleActor,
        `JSON.stringify((${fn.toString()})()) ?? 'null'`,
      );
      return JSON.parse(json) as T;
    },
    errors: () => [...session.errors],
  };
}

function collectErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}

// Snap Firefox cannot read /tmp, so its throwaway profiles live in the snap's own folder.
function createFirefoxProfileDir(): string {
  const root = existsSync('/snap/bin/firefox')
    ? join(homedir(), 'snap/firefox/common/recall-e2e-profiles')
    : join(tmpdir(), 'recall-e2e-profiles');
  const dir = join(root, randomUUID());
  mkdirSync(dir, { recursive: true });
  return dir;
}

async function waitUntil(condition: () => Promise<boolean>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 100));
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
