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
  close: () => Promise<void>;
};

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
  /** Opens a web page in a tab and makes it the active tab. */
  openWebPage: (url: string) => Promise<Page>;
  /**
   * Clicks Recall's toolbar button for the tab showing `page`, like a user would:
   * the browser grants `activeTab` for that tab and opens the real popup.
   */
  openPopup: (page: Page) => Promise<ExtensionPage>;
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
