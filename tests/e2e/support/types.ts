import type { Page } from '@playwright/test';

/** An extension page (popup or library) open in the browser. */
export type ExtensionPage = {
  /**
   * Runs `fn(arg)` inside the page and returns its JSON-serialisable result. `fn` is
   * sent as source text, so it can only use its argument, not variables from the test.
   */
  evaluate: <T, A = undefined>(fn: (arg: A) => T | Promise<T>, arg?: A) => Promise<T>;
  /** Uncaught errors and console.error calls from the extension so far. */
  errors: () => string[];
  /** Runs `action`, which should make the page download one file, and returns that file. */
  download: (action: () => Promise<void>) => Promise<DownloadedFile>;
  /** Real mouse and keyboard input. Not available in the popup. */
  user: UserInput;
  close: () => Promise<void>;
};

export type DownloadedFile = { filename: string; text: string };

/**
 * Mouse and keyboard input that reaches the page through the browser, as a person's
 * does: the events are trusted, count as user activation, and can open the browser's
 * file chooser. The helpers in dom.ts instead create events inside the page.
 */
export type UserInput = {
  /** Clicks the middle of the first element matching `selector`, scrolling to it first. */
  click: (selector: string) => Promise<void>;
  /** Presses and releases one key, such as "/", "a", or "Escape". */
  press: (key: string) => Promise<void>;
  /** Types `text` one key at a time. */
  type: (text: string) => Promise<void>;
  /**
   * Clicks `selector`, which must open the browser's file chooser, and picks a file
   * named `name` containing `text`. Fails if no file chooser opens.
   */
  chooseFile: (selector: string, file: { name: string; text: string }) => Promise<void>;
};

/** One entry in the browser's own list of downloads. */
export type BrowserDownload = { url: string; complete: boolean };

/** Input for pages where tests cannot send real input. Every method fails. */
export function unavailableInput(where: string): UserInput {
  const fail = () => Promise.reject(new Error(`Tests cannot send real input to ${where}`));
  return { click: fail, press: fail, type: fail, chooseFile: fail };
}

/** Things only Firefox's debugger protocol can simulate. Chrome's DevTools cannot. */
export type FirefoxControls = {
  /** Resolves with the next popup that opens. Call it before the action that opens one. */
  nextPopup: () => Promise<ExtensionPage>;
  /**
   * Opens a page WebDriver cannot navigate to (such as `about:addons`) in a new tab,
   * then clicks Recall's toolbar button there.
   */
  openPopupOnBrowserPage: (url: string) => Promise<ExtensionPage>;
  /** Presses one of Recall's keyboard shortcuts (for example "Alt+Shift+S") on `page`. */
  pressShortcut: (page: Page, shortcut: string) => Promise<void>;
  /** Right-clicks `selector` and returns the labels of Recall's menu items, then closes the menu. */
  contextMenuItems: (page: Page, selector: string) => Promise<string[]>;
  /** Right-clicks `selector` and chooses Recall's menu item with this label. */
  chooseContextMenuItem: (page: Page, selector: string, label: string) => Promise<void>;
  /** Badge text and tooltip of the toolbar button for the active tab. */
  toolbarButton: () => Promise<{ badge: string; title: string }>;
};

export type InstalledExtension = {
  isBackgroundRunning: () => Promise<boolean>;
  /** Opens one of the extension's own pages (such as `library.html`) in a new tab. */
  openPage: (path: string) => Promise<ExtensionPage>;
  /**
   * Resolves with the next extension page that opens at `path` (such as `library.html`),
   * whatever its query string. Call it before the action that opens the page.
   */
  nextPage: (path: string) => Promise<ExtensionPage>;
  /** Opens a web page in a tab and makes it the active tab. */
  openWebPage: (url: string) => Promise<Page>;
  /**
   * Clicks Recall's toolbar button for the tab showing `page`, like a user would:
   * the browser grants `activeTab` for that tab and opens the real popup.
   */
  openPopup: (page: Page) => Promise<ExtensionPage>;
  /** The browser's own list of downloads (chrome://downloads, or Firefox's Library). */
  browserDownloads: () => Promise<BrowserDownload[]>;
  /** Present when the browser is Firefox. */
  firefox: FirefoxControls | undefined;
};

export type LaunchedExtension = { extension: InstalledExtension; close: () => Promise<void> };

export type BuiltManifest = {
  name: string;
  version: string;
  geckoId: string | undefined;
};

export type LaunchOptions = {
  extensionDir: string;
  profileDir: string;
  channel: string | undefined;
  headless: boolean;
};

/** Source text that calls `fn` with `arg` (sent through JSON). */
export function callExpression(fn: (arg: never) => unknown, arg: unknown): string {
  return `(${fn.toString()})(${arg === undefined ? 'undefined' : JSON.stringify(arg)})`;
}

export async function waitUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
