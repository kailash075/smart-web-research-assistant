import { readFileSync } from 'node:fs';
import { chromium, type BrowserContext, type CDPSession, type Page } from '@playwright/test';
import {
  callExpression,
  unavailableInput,
  waitUntil,
  type BrowserDownload,
  type ExtensionPage,
  type InstalledExtension,
  type LaunchedExtension,
  type LaunchOptions,
  type UserInput,
} from './types';

type TargetInfo = { targetId: string; type: string; url: string };

// Branded Chrome 137+ ignores --load-extension, so we install through the DevTools
// protocol instead (the same method web-ext uses). Playwright disables extensions by
// default, so that flag is removed.
export async function launchChrome({
  extensionDir,
  profileDir,
  channel,
  headless,
}: LaunchOptions): Promise<LaunchedExtension> {
  const context = await chromium.launchPersistentContext(profileDir, {
    ...(channel ? { channel } : {}),
    headless,
    args: ['--enable-unsafe-extension-debugging'],
    ignoreDefaultArgs: ['--disable-extensions'],
  });
  const browser = context.browser();
  if (!browser) throw new Error('Chrome browser handle is unavailable');
  const session = await browser.newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: extensionDir });
  const origin = `chrome-extension://${id}/`;

  const errors: string[] = [];
  const extension: InstalledExtension = {
    isBackgroundRunning: async () => {
      const isOurs = (url: string) => url.startsWith(origin);
      if (context.serviceWorkers().some((worker) => isOurs(worker.url()))) return true;
      await context.waitForEvent('serviceworker', { predicate: (worker) => isOurs(worker.url()) });
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
    openPopup: (page) => openPopup(session, id, page, errors),
    browserDownloads: () => browserDownloads(context),
    firefox: undefined,
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
async function openPopup(
  session: CDPSession,
  extensionId: string,
  page: Page,
  errors: string[],
): Promise<ExtensionPage> {
  await page.bringToFront();
  const tabs = await getTargets(session, 'tab');
  const tab = tabs.filter((target) => target.url === page.url());
  if (tab.length !== 1 || !tab[0]) {
    throw new Error(`Expected one tab showing ${page.url()}, found ${String(tab.length)}`);
  }
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const before = new Set((await getTargets(session)).map((target) => target.targetId));
  await session.send('Extensions.triggerAction', { id: extensionId, targetId: tab[0].targetId });

  let popup: TargetInfo | undefined;
  await waitUntil(async () => {
    popup = (await getTargets(session)).find(
      (target) => target.url === popupUrl && !before.has(target.targetId),
    );
    return popup !== undefined;
  });
  if (!popup) throw new Error('The popup did not open');
  const popupPage = await attachToTarget(session, popup.targetId, errors);
  await waitUntil(async () => (await popupPage.evaluate(() => document.readyState)) === 'complete');
  return popupPage;
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
