import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
} from './types';

// The `browser` namespace of the extension's own pages.
declare const browser: { tabs: { getCurrent: () => Promise<{ id?: number } | undefined> } };

/** Runs code in Firefox's browser process (see browserProcessScript) and returns its string. */
type BrowserCode = (code: string) => Promise<string>;
type PageScript = Pick<ExtensionPage, 'evaluate'>;

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
  // Playwright sends downloads to a folder in /tmp, which snap Firefox cannot write to.
  const downloadsDir = join(profileDir, 'recall-downloads');
  // Files the tests pick in the file chooser, also where snap Firefox can read them.
  const uploadsDir = join(profileDir, 'recall-uploads');
  mkdirSync(downloadsDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  const close = async () => {
    client?.close();
    await context?.close();
  };

  try {
    context = await firefox.launchPersistentContext(profileDir, {
      ...(channel ? { channel } : {}),
      headless,
      downloadsPath: downloadsDir,
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
        // Firefox's experiments service (Nimbus) sometimes blocks quitting while a recipe
        // update is in flight ("RemoteSettingsExperimentLoader: disabling"), until the
        // shutdown watchdog ends Firefox after a minute. Nimbus cannot be turned off
        // from a profile, so give the watchdog 10 seconds instead.
        'toolkit.asyncshutdown.crash_timeout': 10_000,
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
    const browserCode: BrowserCode = (code) =>
      evaluateToString(debuggerClient, parent, browserProcessScript(addonId, code));

    const attachPopup = async (appeared: Promise<string>) => {
      const consoleActor = await appeared;
      return openedPage(debuggerClient, session, consoleActor, {
        downloadsDir,
        input: () => unavailableInput('the popup'),
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
        close: () => closeWindow(debuggerClient, consoleActor),
      });

    const extension: InstalledExtension = {
      isBackgroundRunning: async () =>
        (await getAddon(debuggerClient, addonId))['backgroundScriptStatus'] === 'RUNNING',
      openPage: async (path) => tabPage(await openExtensionTab(debuggerClient, session, path)),
      nextPage: async (path) => tabPage(await session.waitForPage(`/${path}`)),
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
      await browserCode(`
        const tab = win.gBrowser.addTab(${JSON.stringify(url)}, {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
        win.gBrowser.selectedTab = tab;`);
      // Pages in a content process (such as about:reader) send no load event to the
      // browser window, so poll until the tab has finished loading.
      await waitUntil(
        async () =>
          (await browserCode(`
            const browser = win.gBrowser.selectedBrowser;
            const loaded = browser.currentURI.spec !== 'about:blank' &&
              !browser.webProgress.isLoadingDocument;
            return loaded ? 'loaded' : '';`)) === 'loaded',
      );
      const popupOpened = nextPopup();
      await browserCode('actionButton().triggerAction(win);');
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

// Extension pages cannot be opened by WebDriver, so the extension opens its own tab.
// Resolves with the new page's console actor.
async function openExtensionTab(
  client: FirefoxDebugger,
  session: ExtensionDebugSession,
  path: string,
): Promise<string> {
  const appeared = session.waitForPage(`/${path}`);
  await evaluateToString(
    client,
    session.backgroundConsole,
    `browser.tabs.create({ url: ${JSON.stringify(`/${path}`)} }), 'ok'`,
  );
  return appeared;
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
      const seen = window as unknown as { recallE2eInput?: Record<string, number> };
      if (!seen.recallE2eInput) {
        const counts: Record<string, number> = {};
        seen.recallE2eInput = counts;
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
      return seen.recallE2eInput[eventType] ?? 0;
    }, eventType);
    await send();
    await waitUntil(() =>
      page.evaluate(
        ([eventType, expected]) =>
          ((window as unknown as { recallE2eInput: Record<string, number> }).recallE2eInput[
            eventType
          ] ?? 0) >= expected,
        [eventType, before + count] as const,
      ),
    );
  };

  const click = async (selector: string) => {
    const point = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Nothing matches ${selector}`);
      element.scrollIntoView({ block: 'center', behavior: 'instant' });
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    }, selector);
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
          async () => (await browserCode('return String(recallE2eFilePicker.opened);')) !== '0',
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
    registrar.registerFactory(state.cid, 'Recall test file picker', contract, state.factory);
    globalThis.recallE2eFilePicker = state;`;
}

const REMOVE_FILE_PICKER = `
  const state = globalThis.recallE2eFilePicker;
  if (state) {
    const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    registrar.unregisterFactory(state.cid, state.factory);
    registrar.registerFactory(state.original, '', '@mozilla.org/filepicker;1', null);
    delete globalThis.recallE2eFilePicker;
  }`;

// Like browserCode, for code that uses `await`. The result is parked in a global and
// polled, because the debugger returns before promises settle.
async function browserCodeAsync(browserCode: BrowserCode, code: string): Promise<string> {
  const slot = `recallE2e_${randomUUID().replaceAll('-', '')}`;
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
