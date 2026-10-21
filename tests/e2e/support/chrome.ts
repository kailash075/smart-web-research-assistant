import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  chromium,
  test,
  type BrowserContext,
  type CDPSession,
  type Page,
  type Worker,
} from '@playwright/test';
import { desktopControls } from './desktop';
import {
  callExpression,
  unavailableInput,
  waitUntil,
  type BrowserDownload,
  type ColorScheme,
  type ExtensionPage,
  type InstalledExtension,
  type LaunchedExtension,
  type LaunchOptions,
  type UserInput,
  type WebPage,
} from './types';

type TargetInfo = { targetId: string; type: string; url: string; title: string };

// Branded Chrome 137+ ignores --load-extension, so we install through the DevTools
// protocol instead (the same method web-ext uses). Chrome for Testing, used for the
// oldest supported version, still accepts --load-extension, and Chrome 120 has no
// Extensions domain in the protocol. Playwright disables extensions by default, so
// that flag is removed.
export async function launchChrome({
  extensionDir,
  profileDir,
  channel,
  executablePath,
  headless,
  colorScheme,
  display,
  chromeArgs = [],
}: LaunchOptions): Promise<LaunchedExtension> {
  const loadWithFlag = executablePath !== undefined;
  const hidden = headless && !display;
  const context = await chromium.launchPersistentContext(profileDir, {
    ...(channel ? { channel } : {}),
    ...(executablePath ? { executablePath } : {}),
    ...(colorScheme ? { colorScheme } : {}),
    // Before Chrome 132, plain --headless is the old headless mode, which cannot run
    // extensions, so ask for the new one explicitly.
    headless: hidden && !loadWithFlag,
    args: [
      ...(loadWithFlag
        ? [
            `--disable-extensions-except=${extensionDir}`,
            `--load-extension=${extensionDir}`,
            ...(hidden ? ['--headless=new'] : []),
          ]
        : ['--enable-unsafe-extension-debugging']),
      // A window filling the virtual display, drawn through X11 (not the desktop's Wayland).
      ...(display
        ? [
            '--ozone-platform=x11',
            '--window-position=0,0',
            `--window-size=${String(display.width)},${String(display.height)}`,
          ]
        : []),
      ...chromeArgs,
    ],
    // On a display, pages get the window's real size, so screen positions match.
    ...(display ? { env: display.env, viewport: null } : {}),
    ignoreDefaultArgs: ['--disable-extensions'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Chrome browser handle is unavailable');
  const session = await browser.newBrowserCDPSession();
  const id = loadWithFlag
    ? await extensionIdFromWorker(context)
    : (await session.send('Extensions.loadUnpacked', { path: extensionDir })).id;
  const origin = `chrome-extension://${id}/`;
  const isOurs = (worker: Worker) => worker.url().startsWith(origin);
  const background = async () =>
    context.serviceWorkers().find(isOurs) ??
    (await context.waitForEvent('serviceworker', { predicate: isOurs }));

  // Popups already handed to a test; the next popup is any other one.
  const popups = new Set<string>();
  const nextPopup = async () => {
    const popupUrl = `${origin}popup.html`;
    let popup: TargetInfo | undefined;
    await waitUntil(async () => {
      popup = (await getTargets(session)).find(
        (target) => target.url === popupUrl && !popups.has(target.targetId),
      );
      return popup !== undefined;
    });
    if (!popup) throw new Error('The popup did not open');
    popups.add(popup.targetId);
    const popupPage = await attachToTarget(session, popup.targetId, errors, colorScheme);
    await waitUntil(
      async () => (await popupPage.evaluate(() => document.readyState)) === 'complete',
    );
    return popupPage;
  };

  const errors: string[] = [];
  const extension: InstalledExtension = {
    isBackgroundRunning: async () => {
      if (context.serviceWorkers().some(isOurs)) return true;
      await context.waitForEvent('serviceworker', { predicate: isOurs });
      return true;
    },
    openPage: async (path) => {
      const page = await context.newPage();
      collectErrors(page, errors);
      await page.goto(`${origin}${path}`);
      return extensionPage(page, errors);
    },
    nextPage: async (path) => {
      const before = new Set(context.pages());
      const address = `${origin}${path}`;
      let page: Page | undefined;
      await waitUntil(() => {
        page = context
          .pages()
          .find((open) => !before.has(open) && open.url().split(/[?#]/)[0] === address);
        return Promise.resolve(page !== undefined);
      });
      if (!page) throw new Error(`${address} did not open`);
      collectErrors(page, errors);
      await page.waitForLoadState('load');
      return extensionPage(page, errors);
    },
    openWebPage: (url) => openWebPage(context, url),
    openPopup: async (page) => {
      await clickToolbarButton(session, id, page);
      return nextPopup();
    },
    nextPopup,
    toolbarButton: async () =>
      (await background()).evaluate<{ badge: string; title: string }>(`(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        return {
          badge: await chrome.action.getBadgeText({ tabId: tab.id }),
          title: await chrome.action.getTitle({ tabId: tab.id }),
        };
      })()`),
    tabTitle: async (page) =>
      (await getTargets(session, 'page')).find((target) => target.url === page.url())?.title ?? '',
    browserDownloads: () => browserDownloads(context),
    reload: async () => {
      // Chrome starts the new service worker to tell it about the update.
      const restarted = context.waitForEvent('serviceworker', { predicate: isOurs });
      if (loadWithFlag) {
        const page = await context.newPage();
        await page.goto(`${origin}popup.html`);
        // The page closes as the extension reloads, so the reload runs after it replies.
        await page.evaluate('setTimeout(() => chrome.runtime.reload(), 0)');
      } else {
        // Loading the same folder again updates the extension, keeping its ID.
        await session.send('Extensions.loadUnpacked', { path: extensionDir });
      }
      await restarted;
    },
    firefox: undefined,
    desktop: display ? desktopControls(display, join(extensionDir, 'icon/16.png')) : undefined,
  };
  return { extension, close: () => context.close() };
}

function extensionPage(page: Page, errors: string[]): ExtensionPage {
  return {
    evaluate: <T, A>(fn: (arg: A) => T | Promise<T>, arg?: A) =>
      page.evaluate<T>(callExpression(fn, arg)),
    errors: () => [...errors],
    download: async (action) => {
      const [download] = await Promise.all([page.waitForEvent('download'), action()]);
      return {
        filename: download.suggestedFilename(),
        text: readFileSync(await download.path(), 'utf8'),
      };
    },
    user: playwrightInput(page),
    screenshot: () => page.screenshot(),
    close: () => page.close(),
  };
}

// Playwright's mouse and keyboard go through Chrome's input pipeline, and it answers
// the file chooser that the page asks Chrome to open.
function playwrightInput(page: Page): UserInput {
  const click = async (selector: string) => {
    await page.bringToFront();
    await page.locator(selector).first().click();
  };
  return {
    click,
    press: async (key) => {
      await page.bringToFront();
      await page.keyboard.press(key);
    },
    type: async (text) => {
      await page.bringToFront();
      await page.keyboard.type(text);
    },
    chooseFile: async (selector, { name, text }) => {
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 5_000 }),
        click(selector),
      ]);
      await chooser.setFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) });
    },
  };
}

// Reads the list on chrome://downloads. Playwright saves downloads under random names,
// so entries are identified by their address.
async function browserDownloads(context: BrowserContext): Promise<BrowserDownload[]> {
  const page = await context.newPage();
  try {
    await page.goto('chrome://downloads');
    let downloads: BrowserDownload[] = [];
    // The list fills in after the page loads.
    await waitUntil(async () => {
      downloads = await page.evaluate(() =>
        [
          ...(document
            .querySelector('downloads-manager')
            ?.shadowRoot?.querySelectorAll('downloads-item') ?? []),
        ].map((item) => {
          const data = (
            item as unknown as { data?: { url?: string | { url?: string }; state?: number } }
          ).data;
          // Newer Chrome versions wrap the address in a { url } object.
          const url = data?.url;
          return {
            url: typeof url === 'string' ? url : (url?.url ?? ''),
            // downloads.mojom State.kComplete
            complete: data?.state === 2,
          };
        }),
      );
      return downloads.length > 0;
    }, 5_000).catch(() => undefined);
    return downloads;
  } finally {
    await page.close();
  }
}

// An extension loaded with --load-extension gets an ID derived from its folder, which
// shows in its service worker's address.
async function extensionIdFromWorker(context: BrowserContext): Promise<string> {
  const worker =
    context
      .serviceWorkers()
      .find((candidate) => candidate.url().startsWith('chrome-extension://')) ??
    (await context.waitForEvent('serviceworker', {
      predicate: (candidate) => candidate.url().startsWith('chrome-extension://'),
    }));
  const id = new URL(worker.url()).host;
  if (id === '') throw new Error(`No extension ID in ${worker.url()}`);
  return id;
}

async function openWebPage(context: BrowserContext, url: string): Promise<Page> {
  // Reuse the blank start tab so tabs can be told apart by their URL.
  const page =
    context.pages().find((open) => open.url() === 'about:blank') ?? (await context.newPage());
  await page.goto(url);
  await page.bringToFront();
  return page;
}

// Extensions.triggerAction runs the toolbar button's action for a tab, exactly like a
// click: Chrome grants activeTab and opens the popup. Playwright does not attach to
// popups, so the popup is driven through its own DevTools session.
async function clickToolbarButton(
  session: CDPSession,
  extensionId: string,
  page: WebPage,
): Promise<void> {
  await page.bringToFront();
  const tabs = await getTargets(session, 'tab');
  const tab = tabs.filter((target) => target.url === page.url());
  if (tab.length !== 1 || !tab[0]) {
    throw new Error(`Expected one tab showing ${page.url()}, found ${String(tab.length)}`);
  }
  try {
    await session.send('Extensions.triggerAction', { id: extensionId, targetId: tab[0].targetId });
  } catch (error) {
    // Chrome 120 cannot click the toolbar button from tests.
    test.skip(
      String(error).includes("wasn't found"),
      'This Chrome has no Extensions.triggerAction',
    );
    throw error;
  }
}

async function getTargets(session: CDPSession, type?: string): Promise<TargetInfo[]> {
  const { targetInfos } = await session.send('Target.getTargets', {
    ...(type ? { filter: [{ type }] } : {}),
  });
  return targetInfos;
}

// Uses the protocol's non-flattened mode: commands for the popup travel inside
// Target.sendMessageToTarget, and replies come back as events on the browser session.
async function attachToTarget(
  session: CDPSession,
  targetId: string,
  errors: string[],
  colorScheme: ColorScheme | undefined,
): Promise<ExtensionPage> {
  const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: false });
  let nextId = 1;
  const replies = new Map<number, (message: CdpMessage) => void>();

  session.on('Target.receivedMessageFromTarget', (event) => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message) as CdpMessage;
    if (message.id !== undefined) {
      replies.get(message.id)?.(message);
      replies.delete(message.id);
    } else if (message.method === 'Runtime.exceptionThrown') {
      errors.push(JSON.stringify(message.params));
    } else if (message.method === 'Runtime.consoleAPICalled' && isConsoleError(message.params)) {
      errors.push(JSON.stringify(message.params));
    }
  });

  const send = (method: string, params: object): Promise<CdpMessage> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      replies.set(id, resolve);
      session
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({ id, method, params }),
        })
        .catch(reject);
    });

  await send('Runtime.enable', {});
  // Playwright's colour scheme only reaches the pages Playwright drives.
  if (colorScheme) {
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: colorScheme }],
    });
  }
  return {
    evaluate: async <T>(fn: (arg: never) => unknown, arg?: unknown): Promise<T> => {
      const reply = await send('Runtime.evaluate', {
        expression: callExpression(fn, arg),
        awaitPromise: true,
        returnByValue: true,
      });
      const outcome = reply.result as
        { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined;
      if (reply.error !== undefined || outcome?.exceptionDetails !== undefined) {
        throw new Error(`Popup code failed: ${JSON.stringify(reply.error ?? outcome)}`);
      }
      return outcome?.result?.value as T;
    },
    errors: () => [...errors],
    download: () => Promise.reject(new Error('Tests cannot download from the popup')),
    user: unavailableInput('the popup'),
    screenshot: async () => {
      const reply = await send('Page.captureScreenshot', { format: 'png' });
      const image = reply.result as { data?: string } | undefined;
      if (image?.data === undefined) throw new Error('The popup could not be captured');
      return Buffer.from(image.data, 'base64');
    },
    close: async () => {
      await session.send('Target.closeTarget', { targetId });
      await waitUntil(async () =>
        (await getTargets(session)).every((target) => target.targetId !== targetId),
      );
    },
  };
}

type CdpMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
};

function isConsoleError(params: unknown): boolean {
  return (
    typeof params === 'object' && params !== null && 'type' in params && params.type === 'error'
  );
}

function collectErrors(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
}
