import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { firefox, type BrowserContext } from '@playwright/test';
import {
  connectFirefoxDebugger,
  debugExtension,
  evaluateToString,
  getAddon,
  getParentProcessConsole,
  getTabConsole,
  installTemporaryAddon,
  type ExtensionDebugSession,
  type FirefoxDebugger,
} from './firefox-remote';
import { desktopControls } from './desktop';
import { findFreePort } from './ports';
import {
  callExpression,
  unavailableInput,
  waitUntil,
  type BrowserDownload,
  type DownloadedFile,
  type ExtensionPage,
  type FirefoxControls,
  type InstalledExtension,
  type LaunchedExtension,
  type LaunchOptions,
  type UserInput,
  type WebPage,
} from './types';
import type { VirtualDisplay } from './virtual-display';

// The `browser` namespace of the extension's own pages.
declare const browser: { tabs: { getCurrent: () => Promise<{ id?: number } | undefined> } };

/** Runs code in Firefox's browser process (see browserProcessScript) and returns its string. */
type BrowserCode = (code: string) => Promise<string>;
type PageScript = Pick<ExtensionPage, 'evaluate'>;

type Prefs = Record<string, string | number | boolean>;

/** A started Firefox. `context` is Playwright's handle, when Playwright started it. */
type RunningFirefox = { context: BrowserContext | undefined; exit: () => Promise<void> };

// Playwright drives the installed Firefox over WebDriver BiDi (channel "moz-firefox"),
// which can open and script normal web pages. Installing the add-on, reading its
// pages, and simulating toolbar clicks, shortcuts, and context menus go through
// Firefox's debugger protocol.
//
// Playwright's BiDi client needs a recent Firefox (it uses network.addDataCollector,
// which Firefox 140 lacks), so a specific Firefox (`executablePath`, such as the oldest
// supported one) is started directly instead, and its web pages are opened and scripted
// through the debugger protocol too.
export async function launchFirefox({
  extensionDir,
  profileDir,
  channel,
  executablePath,
  headless,
  colorScheme,
  display,
  addonId,
}: LaunchOptions & { addonId: string }): Promise<LaunchedExtension> {
  const debuggerPort = await findFreePort();
  let running: RunningFirefox | undefined;
  let client: FirefoxDebugger | undefined;
  let quit: (() => Promise<void>) | undefined;
  // Playwright sends downloads to a folder in /tmp, which snap Firefox cannot write to.
  const downloadsDir = join(profileDir, 'clipwise-downloads');
  // Files the tests pick in the file chooser, also where snap Firefox can read them.
  const uploadsDir = join(profileDir, 'clipwise-uploads');
  mkdirSync(downloadsDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  const close = async () => {
    await quit?.();
    client?.close();
    await running?.exit();
  };
  const prefs: Prefs = {
    'devtools.debugger.remote-enabled': true,
    'devtools.debugger.prompt-connection': false,
    // Allows evaluating code in the browser's own process (toolbar, menus, keys).
    'devtools.chrome.enabled': true,
    // Tests install the add-on temporarily, and uninstalling an add-on deletes its
    // storage. Firefox 156 kept the data across a restart even without these prefs,
    // but they guarantee the temporary install behaves like a normal signed one.
    'extensions.webextensions.keepStorageOnUninstall': true,
    'extensions.webextensions.keepUuidOnUninstall': true,
    // Firefox's experiments service (Nimbus) sometimes blocks quitting while a recipe
    // update is in flight ("RemoteSettingsExperimentLoader: disabling"), until the
    // shutdown watchdog ends Firefox after a minute. Nimbus cannot be turned off
    // from a profile, so give the watchdog 10 seconds instead.
    'toolkit.asyncshutdown.crash_timeout': 10_000,
    // What pages see in prefers-color-scheme. Popups follow the browser's own theme,
    // which follows the system's.
    ...(colorScheme && {
      'ui.systemUsesDarkTheme': colorScheme === 'dark' ? 1 : 0,
      'layout.css.prefers-color-scheme.content-override': colorScheme === 'dark' ? 0 : 1,
    }),
  };

  try {
    running = executablePath
      ? startFirefox(executablePath, profileDir, debuggerPort, display, {
          ...prefs,
          ...DIRECT_START_PREFS,
          'browser.download.dir': downloadsDir,
        })
      : await startWithPlaywright(profileDir, debuggerPort, display, prefs, {
          headless,
          channel,
          downloadsDir,
        });
    const browserContext = running.context;
    const debuggerClient = await connectFirefoxDebugger(debuggerPort);
    client = debuggerClient;
    const installedId = await installTemporaryAddon(debuggerClient, extensionDir);
    if (installedId !== addonId) throw new Error(`Installed ${installedId}, expected ${addonId}`);
    const addon = await getAddon(debuggerClient, addonId);
    const session = await debugExtension(debuggerClient, String(addon['actor']));
    const parent = await getParentProcessConsole(debuggerClient);
    const browserCode: BrowserCode = (code) =>
      evaluateToString(debuggerClient, parent, browserProcessScript(addonId, code));
    if (!browserContext) {
      // Quits the way the File menu does, so Firefox saves everything first.
      quit = async () => {
        await browserCode(
          'Services.tm.dispatchToMainThread(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit));',
        ).catch(() => undefined);
      };
    }

    const screenshot = async (consoleActor: string) => {
      const address = await evaluateToString(debuggerClient, consoleActor, 'location.href');
      return Buffer.from(await browserCodeAsync(browserCode, drawPage(address)), 'base64');
    };
    const attachPopup = async (appeared: Promise<string>) => {
      const consoleActor = await appeared;
      return openedPage(debuggerClient, session, consoleActor, {
        downloadsDir,
        input: () => unavailableInput('the popup'),
        screenshot: () => screenshot(consoleActor),
        close: async () => {
          await closeWindow(debuggerClient, consoleActor);
          await waitUntil(
            async () => (await browserCode("return openPopup() ? 'open' : '';")) === '',
          );
        },
      });
    };
    // An extension page in a tab, such as the library.
    const tabPage = (consoleActor: string) =>
      openedPage(debuggerClient, session, consoleActor, {
        downloadsDir,
        input: (page) => firefoxTabInput(page, browserCode, uploadsDir),
        screenshot: () => screenshot(consoleActor),
        close: () => closeWindow(debuggerClient, consoleActor),
      });
    const nextPopup = () => attachPopup(session.waitForPage('/popup.html'));

    const extension: InstalledExtension = {
      isBackgroundRunning: async () =>
        (await getAddon(debuggerClient, addonId))['backgroundScriptStatus'] === 'RUNNING',
      openPage: async (path) => tabPage(await openExtensionTab(session, browserCode, path)),
      nextPage: async (path) => tabPage(await session.waitForPage(`/${path}`)),
      openWebPage: async (url) => {
        if (!browserContext) return openDebuggedWebPage(debuggerClient, browserCode, url);
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
      browserDownloads: async () =>
        JSON.parse(
          await browserCodeAsync(
            browserCode,
            `const { Downloads } = ChromeUtils.importESModule(
              'resource://gre/modules/Downloads.sys.mjs');
            const list = await Downloads.getList(Downloads.ALL);
            const downloads = await list.getAll();
            return JSON.stringify(downloads.map((download) =>
              ({ url: download.source.url, complete: download.succeeded })));`,
          ),
        ) as BrowserDownload[],
      reload: async () => {
        const addon = await getAddon(debuggerClient, addonId);
        await debuggerClient.request({ to: String(addon['actor']), type: 'reload' });
      },
      nextPopup,
      // Reads the button as Firefox shows it for the selected tab.
      toolbarButton: async () =>
        JSON.parse(
          await browserCode(`
            const tab = win.gBrowser.selectedTab;
            const { action } = actionButton();
            return JSON.stringify({
              badge: action.getProperty(tab, 'badgeText'),
              title: action.getProperty(tab, 'title'),
            });`),
        ) as { badge: string; title: string },
      tabTitle: (page) =>
        browserCode(`
          const url = ${JSON.stringify(page.url())};
          const tab = win.gBrowser.tabs.find((candidate) =>
            candidate.linkedBrowser.currentURI.spec === url);
          return tab ? tab.label : '';`),
      firefox: firefoxControls(debuggerClient, addonId, browserCode, nextPopup),
      desktop: display ? desktopControls(display, join(extensionDir, 'icon/16.png')) : undefined,
    };
    return { extension, close };
  } catch (error) {
    await close();
    throw error;
  }
}

// Starts Firefox through Playwright, which can then open and script web pages.
async function startWithPlaywright(
  profileDir: string,
  debuggerPort: number,
  display: VirtualDisplay | undefined,
  prefs: Prefs,
  {
    headless,
    channel,
    downloadsDir,
  }: { headless: boolean; channel: string | undefined; downloadsDir: string },
): Promise<RunningFirefox> {
  const context = await firefox.launchPersistentContext(profileDir, {
    ...(channel ? { channel } : {}),
    headless: headless && !display,
    downloadsPath: downloadsDir,
    args: [`--start-debugger-server=${String(debuggerPort)}`, ...windowArgs(display)],
    firefoxUserPrefs: prefs,
    // On a display, pages get the window's real size, so screen positions match.
    ...(display ? { env: display.env, viewport: null } : {}),
  });
  return { context, exit: () => context.close() };
}

// Prefs that WebDriver normally sets: no first-run pages, prompts, or background
// network traffic, and downloads saved without asking (into browser.download.dir).
const DIRECT_START_PREFS: Prefs = {
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'browser.startup.page': 0,
  'browser.aboutwelcome.enabled': false,
  'browser.tabs.warnOnClose': false,
  'datareporting.policy.dataSubmissionEnabled': false,
  'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'services.settings.server': 'data:,#remote-settings-dummy/v1',
  'network.captive-portal-service.enabled': false,
  'browser.safebrowsing.malware.enabled': false,
  'browser.safebrowsing.phishing.enabled': false,
  'browser.download.folderList': 2,
  'browser.download.useDownloadDir': true,
  'browser.download.always_ask_before_handling_new_types': false,
  'browser.download.alwaysOpenPanel': false,
  // Otherwise the first download opens the downloads panel over the top of the page.
  'browser.download.panel.shown': true,
};

// A window filling the virtual display, if there is one.
function windowArgs(display: VirtualDisplay | undefined): string[] {
  return display ? [`--window-size=${String(display.width)},${String(display.height)}`] : [];
}

// Starts Firefox without Playwright, headless unless it has a display. The prefs go
// into the profile's user.js.
function startFirefox(
  executablePath: string,
  profileDir: string,
  debuggerPort: number,
  display: VirtualDisplay | undefined,
  prefs: Prefs,
): RunningFirefox {
  writeFileSync(
    join(profileDir, 'user.js'),
    Object.entries(prefs)
      .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
      .join('\n'),
  );
  const child = spawn(
    executablePath,
    [
      '-profile',
      profileDir,
      '-no-remote',
      ...(display ? windowArgs(display) : ['-headless']),
      '--start-debugger-server',
      String(debuggerPort),
      'about:blank',
    ],
    { stdio: 'ignore', ...(display ? { env: display.env } : {}) },
  );
  const exited = new Promise<void>((resolve) => {
    child.once('exit', () => {
      resolve();
    });
  });
  return {
    context: undefined,
    // Waits for Firefox to quit (asked for through the debugger), then makes sure.
    exit: async () => {
      const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
      if (child.exitCode === null && child.signalCode === null) await exited;
      clearTimeout(timer);
    },
  };
}

function firefoxControls(
  client: FirefoxDebugger,
  addonId: string,
  browserCode: (code: string) => Promise<string>,
  nextPopup: () => Promise<ExtensionPage>,
): FirefoxControls {
  // Right-clicks the element: the browser window sends the mouse events to the page,
  // which asks the browser to show its context menu. (Native mouse events would not
  // open the menu in headless Firefox.)
  const openContextMenu = async (page: WebPage, selector: string) => {
    const point = await page.evaluate(centerOf, selector);
    await browserCode(`${selectTab(page)}
      const box = win.gBrowser.selectedBrowser.getBoundingClientRect();
      const x = box.left + ${String(point.x)};
      const y = box.top + ${String(point.y)};
      for (const type of ['mousedown', 'contextmenu', 'mouseup']) {
        // Newer Firefox (156 here) has window.synthesizeMouseEvent instead of sendMouseEvent.
        if (win.synthesizeMouseEvent) {
          win.synthesizeMouseEvent(type, x, y, { button: 2, clickCount: 1 });
        } else {
          win.windowUtils.sendMouseEvent(type, x, y, 2, 1, 0);
        }
      }`);
    await waitUntil(async () => (await browserCode('return contextMenu().state;')) === 'open');
  };

  return {
    openPopupOnBrowserPage: async (url) => {
      await browserCode(`
        const tab = win.gBrowser.addTab(${JSON.stringify(url)}, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        win.gBrowser.selectedTab = tab;`);
      await waitForSelectedTab(browserCode);
      const popupOpened = nextPopup();
      await browserCode('actionButton().triggerAction(win);');
      return popupOpened;
    },
    pressShortcut: async (page, shortcut) => {
      // Firefox registers each extension shortcut as a <key> element in the browser
      // window; running its command is what pressing the keys does. (Keys synthesized
      // for tests and sent to a page never reach these elements, unlike a person's.)
      const parts = shortcut.split('+');
      const key = parts.pop() ?? '';
      const modifiers = parts.map((part) => part.toLowerCase()).join(',');
      await browserCode(`${selectTab(page)}
        const keys = [...win.document.getElementById('ext-keyset-id-' + widgetId).children];
        const match = keys.find((element) =>
          element.getAttribute('key') === ${JSON.stringify(key)} &&
          element.getAttribute('modifiers') === ${JSON.stringify(modifiers)});
        if (!match) throw new Error('Clipwise has no shortcut ' + ${JSON.stringify(shortcut)});
        match.doCommand();`);
    },
    contextMenuItems: async (page, selector) => {
      await openContextMenu(page, selector);
      const labels = await browserCode(`
        const labels = clipwiseMenuItems().filter((item) => !item.hidden)
          .map((item) => item.getAttribute('label'));
        contextMenu().hidePopup();
        return JSON.stringify(labels);`);
      return JSON.parse(labels) as string[];
    },
    chooseContextMenuItem: async (page, selector, label) => {
      await openContextMenu(page, selector);
      await browserCode(`
        const item = clipwiseMenuItems().find((candidate) =>
          !candidate.hidden && candidate.getAttribute('label') === ${JSON.stringify(label)});
        if (!item) throw new Error('No visible menu item ' + ${JSON.stringify(label)});
        item.doCommand();
        contextMenu().hidePopup();`);
    },
    menuBarAccessKeys: async () =>
      JSON.parse(
        await browserCode(`
          return JSON.stringify([...win.document.querySelectorAll('#main-menubar > menu')]
            .map((menu) => (menu.getAttribute('accesskey') ?? '').toUpperCase())
            .filter(Boolean));`),
      ) as string[],
    browserShortcuts: async () =>
      JSON.parse(
        await browserCode(`
          const names = {
            accel: Services.appinfo.OS === 'Darwin' ? 'Command' : 'Ctrl',
            control: 'Ctrl',
            meta: 'Command',
            alt: 'Alt',
            shift: 'Shift',
          };
          const order = ['Ctrl', 'Command', 'Alt', 'Shift'];
          const shortcuts = [...win.document.querySelectorAll('key')]
            .filter((key) => !key.parentElement.id.startsWith('ext-keyset-id-') &&
              key.getAttribute('disabled') !== 'true')
            .map((key) => {
              const modifiers = (key.getAttribute('modifiers') ?? '').split(/[\\s,]+/)
                .map((name) => names[name] ?? name);
              const main = key.getAttribute('key') ||
                (key.getAttribute('keycode') ?? '').replace(/^VK_/, '');
              return [...order.filter((name) => modifiers.includes(name)), main.toUpperCase()]
                .join('+');
            });
          return JSON.stringify([...new Set(shortcuts)].sort());`),
      ) as string[],
    addonsManagerNames: async () => {
      await browserCodeAsync(
        browserCode,
        `await win.BrowserAddonUI.openAddonsMgr('addons://list/extension');`,
      );
      // about:addons runs in the browser's own process, so its page is reachable here.
      let names: string[] = [];
      await waitUntil(async () => {
        names = JSON.parse(
          await browserCode(`
            const page = win.gBrowser.selectedBrowser.contentDocument;
            return JSON.stringify([...(page?.querySelectorAll('addon-card .addon-name') ?? [])]
              .map((name) => name.textContent.trim()));`),
        ) as string[];
        return names.length > 0;
      });
      return names;
    },
    stopBackground: async () => {
      const addon = await getAddon(client, addonId);
      await client.request({ to: String(addon['actor']), type: 'terminateBackgroundScript' });
      await waitUntil(
        async () => (await getAddon(client, addonId))['backgroundScriptStatus'] !== 'RUNNING',
      );
    },
  };
}

// Wraps code that runs in Firefox's own (privileged) process with helpers for the
// browser window and Clipwise's toolbar button, menu items, and popup. The code can
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
    const clipwiseMenuItems = () =>
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

// Waits until the selected tab has loaded its page. Pages in a content process send no
// load event to the browser window, so this polls.
function waitForSelectedTab(browserCode: BrowserCode): Promise<void> {
  return waitUntil(
    async () =>
      (await browserCode(`
        const browser = win.gBrowser.selectedBrowser;
        const loaded = browser.currentURI.spec !== 'about:blank' &&
          !browser.webProgress.isLoadingDocument;
        return loaded ? 'loaded' : '';`)) === 'loaded',
  );
}

// Opens a web page in a new tab and scripts it through the debugger protocol, for a
// Firefox that Playwright cannot drive.
async function openDebuggedWebPage(
  client: FirefoxDebugger,
  browserCode: BrowserCode,
  url: string,
): Promise<WebPage> {
  await browserCode(`
    const tab = win.gBrowser.addTab(${JSON.stringify(url)}, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    win.gBrowser.selectedTab = tab;`);
  await waitForSelectedTab(browserCode);
  const browser = JSON.parse(
    await browserCode(`
      const browser = win.gBrowser.selectedBrowser;
      return JSON.stringify({ url: browser.currentURI.spec, id: browser.browserId });`),
  ) as { url: string; id: number };
  const consoleActor = await getTabConsole(client, browser.id);
  await waitUntil(
    async () =>
      (await evaluateToString(client, consoleActor, 'document.readyState')) === 'complete',
  );
  const page: WebPage = {
    url: () => browser.url,
    evaluate: <T, A>(fn: (arg: A) => T | Promise<T>, arg?: A) =>
      evaluateInPage<T>(client, consoleActor, callExpression(fn, arg)),
    bringToFront: async () => {
      await browserCode(selectTab(page));
    },
  };
  return page;
}

// Scrolls the element into view and returns its centre, in CSS pixels from the top left
// of the page's viewport. Runs in the page.
function centerOf(selector: string): { x: number; y: number } {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  element.scrollIntoView({ block: 'center', behavior: 'instant' });
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

// Makes the tab showing `page` the selected tab, as a user clicking it would.
function selectTab(page: Pick<WebPage, 'url'>): string {
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

// Extension pages cannot be opened by WebDriver, so the extension opens its own tab.
// Resolves with the new page's console actor.
async function openExtensionTab(
  session: ExtensionDebugSession,
  browserCode: BrowserCode,
  path: string,
): Promise<string> {
  const appeared = session.waitForPage(`/${path}`);
  await browserCode(`
    const tab = win.gBrowser.addTab(extension.baseURI.resolve(${JSON.stringify(path)}), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    win.gBrowser.selectedTab = tab;`);
  return appeared;
}

// Browser-process code (for browserCodeAsync) that draws the extension page at
// `address`, in a tab or the popup, as Firefox shows it. Returns a base64 PNG.
function drawPage(address: string): string {
  return `
    const popup = openPopup();
    const browsers = [...win.gBrowser.browsers, ...(popup ? [popup.browser] : [])];
    const browser = browsers.find((candidate) =>
      candidate.currentURI.spec === ${JSON.stringify(address)});
    if (!browser) throw new Error('No tab or popup shows ' + ${JSON.stringify(address)});
    const tab = win.gBrowser.getTabForBrowser(browser);
    if (tab) win.gBrowser.selectedTab = tab;
    const image = await browser.browsingContext.currentWindowGlobal.drawSnapshot(
      null, win.devicePixelRatio, 'white');
    const canvas = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];`;
}

async function closeWindow(client: FirefoxDebugger, consoleActor: string): Promise<void> {
  await evaluateToString(client, consoleActor, "setTimeout(() => window.close(), 0), 'closing'");
}

async function openedPage(
  client: FirefoxDebugger,
  session: ExtensionDebugSession,
  consoleActor: string,
  options: {
    downloadsDir: string;
    input: (page: PageScript) => UserInput;
    screenshot: () => Promise<Buffer>;
    close: () => Promise<void>;
  },
): Promise<ExtensionPage> {
  await waitUntil(
    async () =>
      (await evaluateToString(client, consoleActor, 'document.readyState')) === 'complete',
  );
  const script: PageScript = {
    evaluate: <T, A>(fn: (arg: A) => T | Promise<T>, arg?: A) =>
      evaluateInPage<T>(client, consoleActor, callExpression(fn, arg)),
  };
  return {
    ...script,
    errors: () => [...session.errors],
    download: (action) => downloadInto(options.downloadsDir, action),
    user: options.input(script),
    screenshot: options.screenshot,
    close: options.close,
  };
}

const KEY_CODES: Record<string, number> = { Backspace: 8, Tab: 9, Enter: 13, Escape: 27 };

// Firefox's WebDriver BiDi refuses input to extension pages, so input comes from the
// browser process instead: native mouse events on the window (headless Firefox handles
// them like the operating system's) and keys through nsITextInputProcessor. Both reach
// the page as trusted events. A stand-in file picker answers the file chooser.
function firefoxTabInput(
  page: PageScript,
  browserCode: BrowserCode,
  uploadsDir: string,
): UserInput {
  let tabId: number | undefined;
  const selectTab = async () => {
    tabId ??= await page.evaluate(async () => (await browser.tabs.getCurrent())?.id ?? -1);
    return `
      const tab = ExtensionParent.apiManager.global.tabTracker.getTab(${String(tabId)});
      win.gBrowser.selectedTab = tab;`;
  };
  // Sends input, then waits until the page has received `count` events of this type,
  // so the next step sees their effects.
  const sendAndWait = async (eventType: string, count: number, send: () => Promise<unknown>) => {
    const before = await page.evaluate((eventType) => {
      // Counts every event of each type the page receives.
      const seen = window as unknown as { clipwiseE2eInput?: Record<string, number> };
      if (!seen.clipwiseE2eInput) {
        const counts: Record<string, number> = {};
        seen.clipwiseE2eInput = counts;
        for (const type of ['mouseup', 'keyup']) {
          addEventListener(
            type,
            () => {
              counts[type] = (counts[type] ?? 0) + 1;
            },
            { capture: true },
          );
        }
      }
      return seen.clipwiseE2eInput[eventType] ?? 0;
    }, eventType);
    await send();
    await waitUntil(() =>
      page.evaluate(
        ([eventType, expected]) =>
          ((window as unknown as { clipwiseE2eInput: Record<string, number> }).clipwiseE2eInput[
            eventType
          ] ?? 0) >= expected,
        [eventType, before + count] as const,
      ),
    );
  };

  const click = async (selector: string) => {
    const point = await page.evaluate(centerOf, selector);
    const tab = await selectTab();
    await sendAndWait('mouseup', 1, () =>
      browserCode(`${tab}
        // Screen coordinates in device pixels, as the operating system reports them.
        const box = tab.linkedBrowser.getBoundingClientRect();
        const scale = win.devicePixelRatio;
        const x = Math.round((win.mozInnerScreenX + box.left + ${String(point.x)}) * scale);
        const y = Math.round((win.mozInnerScreenY + box.top + ${String(point.y)}) * scale);
        const utils = win.windowUtils;
        for (const message of [
          utils.NATIVE_MOUSE_MESSAGE_MOVE,
          utils.NATIVE_MOUSE_MESSAGE_BUTTON_DOWN,
          utils.NATIVE_MOUSE_MESSAGE_BUTTON_UP,
        ]) {
          utils.sendNativeMouseEvent(x, y, message, 0, 0, win.document.documentElement);
        }`),
    );
  };

  // Presses each key in turn, in one call to the browser process.
  const pressKeys = async (keys: string[]) => {
    const tab = await selectTab();
    await sendAndWait('keyup', keys.length, () =>
      browserCode(`${tab}
        win.focus();
        tab.linkedBrowser.focus();
        const keyboard = Cc['@mozilla.org/text-input-processor;1']
          .createInstance(Ci.nsITextInputProcessor);
        if (!keyboard.beginInputTransactionForTests(win)) throw new Error('Keyboard is busy');
        const keyCodes = ${JSON.stringify(KEY_CODES)};
        for (const key of ${JSON.stringify(keys)}) {
          const event = new win.KeyboardEvent('', { key, keyCode: keyCodes[key] ?? 0 });
          keyboard.keydown(event);
          keyboard.keyup(event);
        }`),
    );
  };

  return {
    click,
    press: (key) => pressKeys([key]),
    type: (text) => pressKeys(Array.from(text)),
    chooseFile: async (selector, { name, text }) => {
      const path = join(uploadsDir, name);
      writeFileSync(path, text);
      await browserCode(installFilePicker(path));
      try {
        await click(selector);
        await waitUntil(
          async () => (await browserCode('return String(clipwiseE2eFilePicker.opened);')) !== '0',
          5_000,
        ).catch(() => {
          throw new Error(`Clicking ${selector} did not open a file chooser`);
        });
      } finally {
        await browserCode(REMOVE_FILE_PICKER);
      }
    },
  };
}

// Registers a stand-in for Firefox's file picker component that picks `path` as soon as
// it opens, counting how often it was opened. The page receives the file exactly as if
// the user had chosen it in the system dialog.
function installFilePicker(path: string): string {
  return `
    const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    const contract = '@mozilla.org/filepicker;1';
    const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
    file.initWithPath(${JSON.stringify(path)});
    const state = {
      opened: 0,
      original: registrar.contractIDToCID(contract),
      cid: Services.uuid.generateUUID(),
    };
    state.factory = {
      createInstance(iid) {
        const picker = {
          QueryInterface: ChromeUtils.generateQI(['nsIFilePicker']),
          mode: Ci.nsIFilePicker.modeOpen,
          init(browsingContext, title, mode) {
            this.mode = mode;
          },
          appendFilters() {},
          appendFilter() {},
          appendRawFilter() {},
          defaultString: '',
          defaultExtension: '',
          filterIndex: 0,
          displayDirectory: null,
          displaySpecialDirectory: '',
          addToRecentDocs: false,
          okButtonLabel: '',
          capture: 0,
          get file() { return file; },
          get fileURL() { return Services.io.newFileURI(file); },
          get files() { return [file].values(); },
          isModeSupported() { return true; },
          open(callback) {
            state.opened += 1;
            Services.tm.dispatchToMainThread(() => callback.done(Ci.nsIFilePicker.returnOK));
          },
          close() {},
        };
        return picker.QueryInterface(iid);
      },
    };
    registrar.registerFactory(state.cid, 'Clipwise test file picker', contract, state.factory);
    globalThis.clipwiseE2eFilePicker = state;`;
}

const REMOVE_FILE_PICKER = `
  const state = globalThis.clipwiseE2eFilePicker;
  if (state) {
    const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.unregisterFactory(state.cid, state.factory);
    registrar.registerFactory(state.original, '', '@mozilla.org/filepicker;1', null);
    delete globalThis.clipwiseE2eFilePicker;
  }`;

// Like browserCode, for code that uses `await`. The result is parked in a global and
// polled, because the debugger returns before promises settle.
async function browserCodeAsync(browserCode: BrowserCode, code: string): Promise<string> {
  const slot = `clipwiseE2e_${randomUUID().replaceAll('-', '')}`;
  await browserCode(`
    globalThis.${slot} = '';
    (async () => { ${code} })().then(
      (value) => { globalThis.${slot} = JSON.stringify({ ok: true, value: String(value) }); },
      (error) => { globalThis.${slot} = JSON.stringify({ ok: false, error: String(error) }); },
    );`);
  let outcome = '';
  await waitUntil(async () => {
    outcome = await browserCode(`return globalThis.${slot};`);
    return outcome !== '';
  });
  await browserCode(`delete globalThis.${slot};`);
  const parsed = JSON.parse(outcome) as { ok: true; value: string } | { ok: false; error: string };
  if (!parsed.ok) throw new Error(`Browser code failed: ${parsed.error}`);
  return parsed.value;
}

// Firefox saves downloads straight into the downloads folder, writing "<name>.part"
// first and renaming it when complete.
async function downloadInto(
  downloadsDir: string,
  action: () => Promise<void>,
): Promise<DownloadedFile> {
  const before = new Set(readdirSync(downloadsDir));
  await action();
  let filename = '';
  await waitUntil(() => {
    const added = readdirSync(downloadsDir).find(
      (name) => !before.has(name) && !name.endsWith('.part'),
    );
    if (added === undefined) return Promise.resolve(false);
    filename = added;
    const path = join(downloadsDir, added);
    return Promise.resolve(!existsSync(`${path}.part`) && statSync(path).size > 0);
  });
  return { filename, text: readFileSync(join(downloadsDir, filename), 'utf8') };
}

// The debugger returns immediately for async code, so the result is parked in a
// window property and polled.
async function evaluateInPage<T>(
  client: FirefoxDebugger,
  consoleActor: string,
  expression: string,
): Promise<T> {
  const slot = JSON.stringify(`__clipwiseE2e_${randomUUID()}`);
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
