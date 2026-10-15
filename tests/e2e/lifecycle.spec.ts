import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readLibrary, selectText } from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';
import { LIBRARY, seed } from './support/library-data';

// The `chrome` namespace exists in both browsers' extension pages.
declare const chrome: {
  runtime: { getManifest: () => { version: string } };
  commands: { getAll: () => Promise<{ name?: string; shortcut?: string }[]> };
  contextMenus: { update: (id: string, properties: object) => Promise<void> };
};

const SHORTCUTS = [
  { name: '_execute_action', shortcut: 'Alt+Shift+M' },
  { name: 'save-page', shortcut: 'Alt+Shift+D' },
  { name: 'save-selection', shortcut: 'Alt+Shift+L' },
];

// The shortcuts as the browser assigned them. A browser leaves a shortcut empty when
// its keys are already taken.
const shortcuts = (page: ExtensionPage) =>
  page.evaluate(async () =>
    (await chrome.commands.getAll())
      .map(({ name = '', shortcut = '' }) => ({ name, shortcut }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

test('the browser assigns every keyboard shortcut', async ({ extension }) => {
  const library = await extension.openPage('library.html');
  expect(await shortcuts(library)).toEqual(SHORTCUTS);
});

test("Chrome's shortcuts page shows Clipwise's shortcuts", async ({ extension }) => {
  test.skip(extension.firefox !== undefined, 'chrome://extensions/shortcuts is in Chrome');
  const page = await extension.openWebPage('chrome://extensions/shortcuts');

  await expect
    .poll(() => page.evaluate(readShortcutsPage))
    .toEqual([
      { command: 'Activate the extension', keys: 'Alt + Shift + M' },
      { command: 'Save the current page', keys: 'Alt + Shift + D' },
      { command: 'Save the selected text', keys: 'Alt + Shift + L' },
    ]);
});

test("Firefox's own shortcuts and menu bar leave Clipwise's keys free", async ({ extension }) => {
  const { firefox } = extension;
  test.skip(!firefox, 'Chrome does not assign a shortcut that clashes, checked above');
  if (!firefox) return;

  const builtIn = await firefox.browserShortcuts();
  expect(builtIn).toContain('Ctrl+T');
  for (const { shortcut } of SHORTCUTS) expect(builtIn).not.toContain(shortcut);

  // With focus in a page, Alt+Shift and a menu's letter opens that menu (History is S,
  // Help is H) instead of running an extension's shortcut. desktop.spec.ts presses
  // Clipwise's real keys.
  const menuLetters = await firefox.menuBarAccessKeys();
  expect(menuLetters).toEqual(expect.arrayContaining(['F', 'S', 'H']));
  for (const { shortcut } of SHORTCUTS) expect(menuLetters).not.toContain(shortcut.slice(-1));
});

test('a stopped background wakes up for a shortcut and a menu item', async ({
  extension,
  site,
}) => {
  const { firefox } = extension;
  test.skip(!firefox, 'Chrome cannot press extension shortcuts or click menu items from tests');
  if (!firefox) return;
  const article = await extension.openWebPage(site.url('/article.html'));

  await firefox.stopBackground();
  expect(await extension.isBackgroundRunning()).toBe(false);
  await firefox.pressShortcut(article, 'Alt+Shift+D');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Page saved.' });
  expect(await extension.isBackgroundRunning()).toBe(true);

  await firefox.stopBackground();
  await selectText(article, '#quote');
  await firefox.chooseContextMenuItem(article, '#quote', 'Save selection to Clipwise');
  await expect
    .poll(() => extension.toolbarButton())
    .toEqual({ badge: '✓', title: 'Clipwise: Highlight saved.' });

  const library = await extension.openPage('library.html');
  await expect
    .poll(async () => (await readLibrary(library)).map((card) => card.kind))
    .toEqual(['highlight', 'page']);
  expect(library.errors()).toEqual([]);
});

test('an update keeps the library, the menu items, and the shortcuts', async ({
  extensionDir,
  launchExtension,
  site,
}, testInfo) => {
  // Installs a copy, so the test can raise its version as an update would.
  const folder = testInfo.outputPath('clipwise');
  cpSync(extensionDir, folder, { recursive: true });
  const { extension } = await launchExtension({ extensionDir: folder });
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);

  const manifestPath = join(folder, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  const version = `${String(manifest['version'])}.1`;
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, version }));
  await extension.reload();

  const updated = await extension.openPage('library.html');
  expect(await updated.evaluate(() => chrome.runtime.getManifest().version)).toBe(version);
  await expect.poll(async () => (await readLibrary(updated)).length).toBe(4);
  expect(await shortcuts(updated)).toEqual(SHORTCUTS);
  const { firefox } = extension;
  if (firefox) {
    const article = await extension.openWebPage(site.url('/article.html'));
    expect(await firefox.contextMenuItems(article, '#second')).toEqual(['Save page to Clipwise']);
  } else {
    // Chrome's menus cannot be opened from tests, but updating an item that does not
    // exist fails there.
    await updated.evaluate(async () => {
      await chrome.contextMenus.update('save-page', {});
      await chrome.contextMenus.update('save-selection', {});
    });
  }
  expect(updated.errors()).toEqual([]);
});

test('an update from a build with the earlier shortcuts assigns the current ones', async ({
  extensionDir,
  launchExtension,
}, testInfo) => {
  // Builds before these tests used Alt+Shift+R (which Chrome 153 keeps for itself), S,
  // and H. A browser keeps a shortcut the user chose, but should move one the user
  // never changed to the new suggestion.
  const folder = testInfo.outputPath('clipwise');
  cpSync(extensionDir, folder, { recursive: true });
  const manifestPath = join(folder, 'manifest.json');
  const current = readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(current) as {
    version: string;
    commands: Record<string, { suggested_key: { default: string } }>;
  };
  const earlier = {
    _execute_action: 'Alt+Shift+R',
    'save-page': 'Alt+Shift+S',
    'save-selection': 'Alt+Shift+H',
  };
  for (const [name, key] of Object.entries(earlier)) {
    const command = manifest.commands[name];
    if (command) command.suggested_key.default = key;
  }
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: '0.0.1' }));
  const { extension } = await launchExtension({ extensionDir: folder });
  const before = await extension.openPage('library.html');
  expect((await shortcuts(before)).map(({ shortcut }) => shortcut)).toContain('Alt+Shift+S');

  writeFileSync(manifestPath, current);
  await extension.reload();

  const updated = await extension.openPage('library.html');
  // Chrome 120 moves the save shortcuts but keeps the earlier key for opening Clipwise;
  // Chrome 153 and Firefox move all three. Clipwise was never published with the earlier
  // keys, so only test installs are affected.
  const chrome120 = /Chrome\/120\./.test(await updated.evaluate(() => navigator.userAgent));
  expect(await shortcuts(updated)).toEqual(
    SHORTCUTS.map((command) =>
      chrome120 && command.name === '_execute_action'
        ? { ...command, shortcut: earlier._execute_action }
        : command,
    ),
  );
});

// The rows of chrome://extensions/shortcuts: each command's name and the keys shown in
// its box. Runs in the page, whose parts are inside shadow roots.
function readShortcutsPage(): { command: string; keys: string }[] {
  const names: string[] = [];
  const keys: string[] = [];
  const walk = (root: Document | ShadowRoot) => {
    for (const element of Array.from(root.querySelectorAll('*'))) {
      if (element.classList.contains('command-name')) names.push(element.textContent.trim());
      if (element.tagName === 'CR-INPUT') keys.push((element as HTMLInputElement).value);
      if (element.shadowRoot) walk(element.shadowRoot);
    }
  };
  walk(document);
  return names.map((command, index) => ({ command, keys: keys[index] ?? '' }));
}
