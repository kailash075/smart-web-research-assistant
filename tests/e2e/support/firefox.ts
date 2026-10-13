import { randomUUID } from 'node:crypto';
import { firefox, type BrowserContext, type Page } from '@playwright/test';
import {
  connectFirefoxDebugger,
  debugExtension,
  evaluateToString,
  getAddon,
  getParentProcessConsole,
  installTemporaryAddon,
  type ExtensionDebugSession,
  type FirefoxDebugger,
} from './firefox-remote';
import { findFreePort } from './ports';
import {
  callExpression,
  waitUntil,
  type ExtensionPage,
  type FirefoxControls,
  type InstalledExtension,
  type LaunchedExtension,
  type LaunchOptions,
} from './types';

// Playwright drives the installed Firefox over WebDriver BiDi (channel "moz-firefox"),
// which can open and script normal web pages. Installing the add-on, reading its
// pages, and simulating toolbar clicks, shortcuts, and context menus go through
// Firefox's debugger protocol.
export async function launchFirefox({
  extensionDir,
  profileDir,
  channel,
  headless,
  addonId,
}: LaunchOptions & { addonId: string }): Promise<LaunchedExtension> {
  const debuggerPort = await findFreePort();
  let context: BrowserContext | undefined;
  let client: FirefoxDebugger | undefined;
  const close = async () => {
    client?.close();
    await context?.close();
  };

  try {
    context = await firefox.launchPersistentContext(profileDir, {
      ...(channel ? { channel } : {}),
      headless,
      args: [`--start-debugger-server=${String(debuggerPort)}`],
      firefoxUserPrefs: {
        'devtools.debugger.remote-enabled': true,
        'devtools.debugger.prompt-connection': false,
        // Allows evaluating code in the browser's own process (toolbar, menus, keys).
        'devtools.chrome.enabled': true,
        // Tests install the add-on temporarily, and uninstalling an add-on deletes its
        // storage. Firefox 156 kept the data across a restart even without these prefs,
        // but they guarantee the temporary install behaves like a normal signed one.
        'extensions.webextensions.keepStorageOnUninstall': true,
        'extensions.webextensions.keepUuidOnUninstall': true,
      },
    });
    const browserContext = context;
    const debuggerClient = await connectFirefoxDebugger(debuggerPort);
    client = debuggerClient;
    const installedId = await installTemporaryAddon(debuggerClient, extensionDir);
    if (installedId !== addonId) throw new Error(`Installed ${installedId}, expected ${addonId}`);
    const addon = await getAddon(debuggerClient, addonId);
    const session = await debugExtension(debuggerClient, String(addon['actor']));
    const parent = await getParentProcessConsole(debuggerClient);
    const browserCode = (code: string) =>
      evaluateToString(debuggerClient, parent, browserProcessScript(addonId, code));

    const attachPopup = async (appeared: Promise<string>) => {
      const consoleActor = await appeared;
      return openedPage(debuggerClient, session, consoleActor, async () => {
        await evaluateToString(
          debuggerClient,
          consoleActor,
          "setTimeout(() => window.close(), 0), 'closing'",
        );
        await waitUntil(
          async () => (await browserCode("return openPopup() ? 'open' : '';")) === '',
        );
      });
    };

    const extension: InstalledExtension = {
      isBackgroundRunning: async () =>
        (await getAddon(debuggerClient, addonId))['backgroundScriptStatus'] === 'RUNNING',
      openPage: (path) => openExtensionPage(debuggerClient, session, path),
      openWebPage: async (url) => {
        const page =
          browserContext.pages().find((open) => open.url() === 'about:blank') ??
          (await browserContext.newPage());
        await page.goto(url);
        await browserCode(selectTab(page));
        return page;
      },
      openPopup: async (page) => {
        const appeared = session.waitForPage('/popup.html');
        await browserCode(`${selectTab(page)} actionButton().triggerAction(win);`);
        return attachPopup(appeared);
      },
      firefox: firefoxControls(debuggerClient, session, browserCode, () =>
        attachPopup(session.waitForPage('/popup.html')),
      ),
    };
    return { extension, close };
  } catch (error) {
    await close();
    throw error;
  }
}

function firefoxControls(
  client: FirefoxDebugger,
  session: ExtensionDebugSession,
  browserCode: (code: string) => Promise<string>,
  nextPopup: () => Promise<ExtensionPage>,
): FirefoxControls {
  const openContextMenu = async (page: Page, selector: string) => {
    await browserCode(selectTab(page));
    await page.click(selector, { button: 'right' });
    await waitUntil(async () => (await browserCode('return contextMenu().state;')) === 'open');
  };

  return {
    nextPopup,
    openPopupOnBrowserPage: async (url) => {
      const popupOpened = nextPopup();
      await browserCode(`
        const tab = win.gBrowser.addTab(${JSON.stringify(url)}, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        win.gBrowser.selectedTab = tab;
        tab.linkedBrowser.addEventListener('load', () => actionButton().triggerAction(win), {
          capture: true,
          once: true,
        });`);
      return popupOpened;
    },
    pressShortcut: async (page, shortcut) => {
      // Firefox registers each extension shortcut as a <key> element in the browser
      // window; running its command is what pressing the keys does.
      const parts = shortcut.split('+');
      const key = parts.pop() ?? '';
      const modifiers = parts.map((part) => part.toLowerCase()).join(',');
      await browserCode(`${selectTab(page)}
        const keys = [...win.document.getElementById('ext-keyset-id-' + widgetId).children];
        const match = keys.find((element) =>
          element.getAttribute('key') === ${JSON.stringify(key)} &&
          element.getAttribute('modifiers') === ${JSON.stringify(modifiers)});
        if (!match) throw new Error('Recall has no shortcut ' + ${JSON.stringify(shortcut)});
        match.doCommand();`);
    },
    contextMenuItems: async (page, selector) => {
      await openContextMenu(page, selector);
      const labels = await browserCode(`
        const labels = recallMenuItems().filter((item) => !item.hidden)
          .map((item) => item.getAttribute('label'));
        contextMenu().hidePopup();
        return JSON.stringify(labels);`);
      return JSON.parse(labels) as string[];
    },
    chooseContextMenuItem: async (page, selector, label) => {
      await openContextMenu(page, selector);
      await browserCode(`
        const item = recallMenuItems().find((candidate) =>
          !candidate.hidden && candidate.getAttribute('label') === ${JSON.stringify(label)});
        if (!item) throw new Error('No visible menu item ' + ${JSON.stringify(label)});
        item.doCommand();
        contextMenu().hidePopup();`);
    },
    toolbarButton: async () => {
      const state = await evaluateInPage<{ badge: string; title: string }>(
        client,
        session.backgroundConsole,
        `browser.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => ({
          badge: await browser.action.getBadgeText({ tabId: tab.id }),
          title: await browser.action.getTitle({ tabId: tab.id }),
        }))`,
      );
      return state;
    },
  };
}

// Wraps code that runs in Firefox's own (privileged) process with helpers for the
// browser window and Recall's toolbar button, menu items, and popup. The code can
// `return` a string; anything else becomes ''.
function browserProcessScript(addonId: string, code: string): string {
  return `(() => {
    const { ExtensionParent } = ChromeUtils.importESModule(
      'resource://gre/modules/ExtensionParent.sys.mjs');
    const extension = ExtensionParent.GlobalManager.getExtension(${JSON.stringify(addonId)});
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    const widgetId = ${JSON.stringify(widgetIdOf(addonId))};
    const actionButton = () => ExtensionParent.apiManager.global.browserActionFor(extension);
    const contextMenu = () => win.document.getElementById('contentAreaContextMenu');
    const recallMenuItems = () =>
      [...contextMenu().querySelectorAll('menuitem')].filter((item) =>
        item.id.startsWith(widgetId + '-menuitem-'));
    const openPopup = () => {
      const { BasePopup } = ChromeUtils.importESModule(
        'resource:///modules/ExtensionPopups.sys.mjs');
      return BasePopup.for(extension, win);
    };
    const result = (() => { ${code} })();
    return typeof result === 'string' ? result : '';
  })()`;
}

// Makes the tab showing `page` the selected tab, as a user clicking it would.
function selectTab(page: Page): string {
  const url = JSON.stringify(page.url());
  return `
    const tab = win.gBrowser.tabs.find((candidate) =>
      candidate.linkedBrowser.currentURI.spec === ${url});
    if (!tab) throw new Error('No tab shows ' + ${url});
    win.gBrowser.selectedTab = tab;`;
}

// Firefox's makeWidgetId(): the add-on ID, lowercased, with other characters as "_".
function widgetIdOf(addonId: string): string {
  return addonId.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

async function openExtensionPage(
  client: FirefoxDebugger,
  session: ExtensionDebugSession,
  path: string,
): Promise<ExtensionPage> {
  const appeared = session.waitForPage(`/${path}`);
  // Extension pages cannot be opened by WebDriver, so the extension opens its own tab.
  await evaluateToString(
    client,
    session.backgroundConsole,
    `browser.tabs.create({ url: ${JSON.stringify(`/${path}`)} }), 'ok'`,
  );
  const consoleActor = await appeared;
  return openedPage(client, session, consoleActor, async () => {
    await evaluateToString(client, consoleActor, "setTimeout(() => window.close(), 0), 'closing'");
  });
}

async function openedPage(
  client: FirefoxDebugger,
  session: ExtensionDebugSession,
  consoleActor: string,
  close: () => Promise<void>,
): Promise<ExtensionPage> {
  await waitUntil(
    async () =>
      (await evaluateToString(client, consoleActor, 'document.readyState')) === 'complete',
  );
  return {
    evaluate: <T, A>(fn: (arg: A) => T | Promise<T>, arg?: A) =>
      evaluateInPage<T>(client, consoleActor, callExpression(fn, arg)),
    errors: () => [...session.errors],
    close,
  };
}

// The debugger returns immediately for async code, so the result is parked in a
// window property and polled.
async function evaluateInPage<T>(
  client: FirefoxDebugger,
  consoleActor: string,
  expression: string,
): Promise<T> {
  const slot = JSON.stringify(`__recallE2e_${randomUUID()}`);
  await evaluateToString(
    client,
    consoleActor,
    `window[${slot}] = '';
    Promise.resolve()
      .then(() => ${expression})
      .then(
        (value) => { window[${slot}] = JSON.stringify({ ok: true, value: value ?? null }); },
        (error) => { window[${slot}] = JSON.stringify({ ok: false, error: String(error) }); },
      );
    'started'`,
  );
  let outcome = '';
  await waitUntil(async () => {
    outcome = await evaluateToString(client, consoleActor, `window[${slot}]`);
    return outcome !== '';
  });
  const parsed = JSON.parse(outcome) as { ok: true; value: T } | { ok: false; error: string };
  if (!parsed.ok) throw new Error(`Page code failed: ${parsed.error}`);
  return parsed.value;
}
