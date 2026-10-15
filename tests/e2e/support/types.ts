import type { ScreenBox, ScreenPoint, VirtualDisplay } from './virtual-display';

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
  /** A PNG image of the page as the browser shows it. */
  screenshot: () => Promise<Buffer>;
  close: () => Promise<void>;
};

/** The colour scheme pages see in `prefers-color-scheme`. */
export type ColorScheme = 'light' | 'dark';

/**
 * A web page open in a tab. Playwright's Page is one. Where Playwright cannot drive the
 * browser (Firefox 140), the Firefox debugger protocol provides the same methods.
 */
export type WebPage = {
  url: () => string;
  evaluate: ExtensionPage['evaluate'];
  /** Makes the page's tab the selected tab. */
  bringToFront: () => Promise<void>;
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
  /**
   * Opens a page WebDriver cannot navigate to (such as `about:addons`) in a new tab,
   * then clicks Clipwise's toolbar button there.
   */
  openPopupOnBrowserPage: (url: string) => Promise<ExtensionPage>;
  /** Presses one of Clipwise's keyboard shortcuts (for example "Alt+Shift+D") on `page`. */
  pressShortcut: (page: WebPage, shortcut: string) => Promise<void>;
  /**
   * The letters of the menu bar's menus (in English, F for File, S for History, …).
   * With focus in a page, Alt+Shift and one of these opens that menu, and an
   * extension's shortcut with those keys never runs.
   */
  menuBarAccessKeys: () => Promise<string[]>;
  /** Firefox's own keyboard shortcuts in the browser window, such as "Ctrl+T". */
  browserShortcuts: () => Promise<string[]>;
  /** Opens the extensions list of the Add-ons Manager and returns the names it shows. */
  addonsManagerNames: () => Promise<string[]>;
  /** Stops the background page, as Firefox does once it has been idle for a while. */
  stopBackground: () => Promise<void>;
  /** Right-clicks `selector` and returns the labels of Clipwise's menu items, then closes the menu. */
  contextMenuItems: (page: WebPage, selector: string) => Promise<string[]>;
  /** Right-clicks `selector` and chooses Clipwise's menu item with this label. */
  chooseContextMenuItem: (page: WebPage, selector: string, label: string) => Promise<void>;
};

/**
 * Real input from the operating system, for a browser running on a virtual display
 * (see virtual-display.ts). Browsers treat it as a person's input: it runs extension
 * shortcuts and opens native context menus, which automation protocols cannot do.
 */
export type DesktopControls = {
  /** Presses each key combination in turn ("Alt+Shift+D", "Escape", …) wherever focus is. */
  pressKeys: (...combinations: string[]) => Promise<void>;
  /** Brings the page to the front and clicks the middle of `selector` in it. */
  click: (page: WebPage, selector: string, button?: 'left' | 'right') => Promise<void>;
  /** Clicks a point on the screen, such as a menu item found with `findIcon`. */
  clickAt: (point: ScreenPoint, button?: 'left' | 'right') => Promise<void>;
  /** Saves the whole screen, native menus included, as a PNG. */
  screenshot: (path: string) => Promise<void>;
  /** Where Clipwise's 16-pixel icon appears on screen (inside `box`, if given). */
  findIcon: (box?: ScreenBox) => Promise<ScreenPoint[]>;
  /**
   * Runs `open` (a right-click, or the Shift+F10 menu key) and waits for the browser's
   * native context menu. Returns where the menu is and where Clipwise's items are in it,
   * found by Clipwise's icon, which both browsers show next to an extension's menu items.
   * Press Escape to close the menu, or click an item.
   */
  openContextMenu: (open: () => Promise<void>) => Promise<ContextMenu>;
};

export type ContextMenu = { box: ScreenBox; clipwiseItems: ScreenPoint[] };

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
  openWebPage: (url: string) => Promise<WebPage>;
  /**
   * Clicks Clipwise's toolbar button for the tab showing `page`, like a user would:
   * the browser grants `activeTab` for that tab and opens the real popup.
   */
  openPopup: (page: WebPage) => Promise<ExtensionPage>;
  /** Resolves with the next popup that opens. Call it before the action that opens one. */
  nextPopup: () => Promise<ExtensionPage>;
  /** Badge text and tooltip of the toolbar button for the active tab. */
  toolbarButton: () => Promise<{ badge: string; title: string }>;
  /**
   * The title shown on `page`'s tab. For a PDF, that is the document's title, which
   * the browser's viewer sets once it has loaded the file.
   */
  tabTitle: (page: WebPage) => Promise<string>;
  /** The browser's own list of downloads (chrome://downloads, or Firefox's Library). */
  browserDownloads: () => Promise<BrowserDownload[]>;
  /**
   * Reloads the extension from its folder, as the browser does when it installs an
   * update. The extension's open pages close.
   */
  reload: () => Promise<void>;
  /** Present when the browser is Firefox. */
  firefox: FirefoxControls | undefined;
  /** Present when the browser runs on a virtual display. */
  desktop: DesktopControls | undefined;
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
  /** A browser other than the installed one, such as the oldest supported version. */
  executablePath: string | undefined;
  headless: boolean;
  /** The browser's default when undefined (light, in the test browsers). */
  colorScheme: ColorScheme | undefined;
  /** Shows the browser window on this display instead of running headless. */
  display: VirtualDisplay | undefined;
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
