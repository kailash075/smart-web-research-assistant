import {
  buttonSelector,
  cardSelector,
  chooseFile,
  click,
  clickButton,
  isDisabled,
  readLibrary,
  textOf,
} from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';
import { clearStorage, LIBRARY, seed, storedItem, storedRecord } from './support/library-data';

const notice = (page: ExtensionPage) => () => textOf(page, '[data-testid="library-notice"] p');
// Each line of the import preview, without the expandable list of problems.
const summary = (page: ExtensionPage) => () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="import-summary"] > li')].map((item) => {
      const line = item.cloneNode(true) as Element;
      line.querySelector('details')?.remove();
      return line.textContent.replace(/\s+/g, ' ').trim();
    }),
  );
const importButton = (page: ExtensionPage) => () =>
  textOf(page, '[data-testid="import-panel"] .button--primary');
const titles = (page: ExtensionPage) => async () =>
  (await readLibrary(page)).map((card) => `${card.kind ?? ''}: ${card.title}`).sort();

function exportFile(items: unknown[], fields: Record<string, unknown> = {}): string {
  return JSON.stringify({ format: 'clipwise-export', version: 1, items, ...fields });
}

test('exports the library to a file that imports back after starting over', async ({
  extension,
}) => {
  const library = await extension.openPage('library.html');
  await expect.poll(() => textOf(library, '[data-testid="empty-library"] h2')).not.toBeNull();
  expect(await isDisabled(library, '.library__backup button')).toBe(true);

  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);
  const saved = await titles(library)();

  // A real download through the browser.
  const file = await library.download(() => clickButton(library, 'Export'));
  expect(file.filename).toMatch(/^clipwise-export-\d{4}-\d{2}-\d{2}\.json$/);
  const content = JSON.parse(file.text) as { format: string; version: number; items: unknown[] };
  expect(content).toMatchObject({ format: 'clipwise-export', version: 1 });
  expect(content.items).toEqual(expect.arrayContaining(Object.values(LIBRARY)));
  expect(content.items).toHaveLength(4);
  await expect.poll(notice(library)).toContain(`Exported 4 items to ${file.filename}.`);

  // Start over, then restore from the file.
  await clearStorage(library);
  await expect.poll(() => textOf(library, '[data-testid="empty-library"] h2')).not.toBeNull();
  await chooseFile(library, '[data-testid="import-file"]', {
    name: file.filename,
    text: file.text,
  });
  await expect.poll(summary(library)).toEqual(['4 new items to add']);
  expect(await textOf(library, '[data-testid="import-panel"] h2')).toBe(
    `Import from ${file.filename}`,
  );
  await clickButton(library, 'Import 4 items');

  await expect.poll(titles(library)).toEqual(saved);
  await expect.poll(notice(library)).toContain('Imported 4 new items.');
  expect(await textOf(library, '[data-testid="import-panel"]')).toBeNull();
  expect(await storedRecord(library, 'paper')).toEqual(LIBRARY['item:paper']);
  expect(library.errors()).toEqual([]);
});

test('refuses files it cannot import and says why', async ({ extension }) => {
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);

  const cases = [
    ['notes.json', 'this is { not json', 'This file is not valid JSON.'],
    ['bookmarks.json', '{"bookmarks": []}', 'This is not a Clipwise export file.'],
    [
      'future.json',
      exportFile([], { version: 99 }),
      'This file was exported by a newer version of Clipwise. Update Clipwise to import it.',
    ],
    [
      'broken.json',
      '{"format": "clipwise-export", "version": 1}',
      'This Clipwise export file is damaged and cannot be imported.',
    ],
  ] as const;
  for (const [name, text, reason] of cases) {
    await chooseFile(library, '[data-testid="import-file"]', { name, text });
    await expect
      .poll(() => textOf(library, '[data-testid="library-notice"] [role="alert"]'))
      .toContain(`Could not import ${name}. ${reason}`);
    expect(await textOf(library, '[data-testid="import-panel"]')).toBeNull();
  }

  await clickButton(library, 'Dismiss');
  await expect.poll(notice(library)).toBeNull();
  expect(await readLibrary(library)).toHaveLength(4);
  expect(library.errors()).toEqual([]);
});

test('previews duplicates and conflicts, and replaces only when asked', async ({ extension }) => {
  const library = await extension.openPage('library.html');
  const paper = LIBRARY['item:paper'] as Record<string, unknown>;
  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);

  const theirPaper = { ...paper, id: 'their-paper', note: 'Edited on my laptop' };
  const newPage = storedItem('new', {
    url: 'https://blog.example/post',
    pageTitle: 'A new blog post',
    createdAt: '2026-10-05T08:00:00.000Z',
  })['item:new'];
  const text = exportFile([
    theirPaper,
    LIBRARY['item:news'],
    newPage,
    newPage,
    { ...(newPage as object), id: 'bad', url: 'javascript:alert(1)' },
  ]);

  await chooseFile(library, '[data-testid="import-file"]', { name: 'laptop.json', text });
  await expect
    .poll(summary(library))
    .toEqual([
      '1 new item to add',
      '1 item already in your library, unchanged',
      '1 item already in your library with a different title, note, tags, or text',
      '1 item repeated in the file (only the first copy is used)',
      '1 entry that cannot be read and will be skipped',
    ]);
  expect(await textOf(library, '[data-testid="import-summary"] details li')).toMatch(
    /^Item 5: url: /,
  );
  // The safe choice is the default.
  expect(
    await library.evaluate(
      () =>
        document.querySelector<HTMLInputElement>('input[name="conflict-policy"]:checked')?.value,
    ),
  ).toBe('keep-existing');
  await expect.poll(importButton(library)).toBe('Import 1 item');
  await clickButton(library, 'Import 1 item');

  await expect
    .poll(notice(library))
    .toContain(
      'Imported 1 new item. Kept your version of 1 item. 1 item was already in your library. Skipped 1 unreadable entry.',
    );
  expect(await readLibrary(library)).toHaveLength(5);
  expect(await storedRecord(library, 'paper')).toEqual(paper);

  // The same file again, this time choosing the file's version.
  await chooseFile(library, '[data-testid="import-file"]', { name: 'laptop.json', text });
  await expect.poll(summary(library)).toContain('0 new items to add');
  await click(library, 'input[name="conflict-policy"][value="replace"]');
  await expect.poll(importButton(library)).toBe('Import 1 item');
  await clickButton(library, 'Import 1 item');
  await expect.poll(notice(library)).toContain('Replaced 1 item.');
  expect(await storedRecord(library, 'paper')).toEqual({ ...theirPaper, id: 'paper' });
  expect(await readLibrary(library)).toHaveLength(5);

  // Now everything in the file is already saved.
  await chooseFile(library, '[data-testid="import-file"]', { name: 'laptop.json', text });
  await expect.poll(importButton(library)).toBe('Nothing to import');
  expect(await isDisabled(library, '[data-testid="import-panel"] .button--primary')).toBe(true);
  await clickButton(library, 'Cancel', '[data-testid="import-panel"]');
  await expect.poll(() => textOf(library, '[data-testid="import-panel"]')).toBeNull();
  expect(library.errors()).toEqual([]);
});

// The tests below use real mouse and keyboard input and the browser's own file chooser
// (see UserInput in support/types.ts), as a person would.

const EXPORT_BUTTON = '.library__backup button';
const IMPORT_BUTTON = '.library__backup label';

/** Clicks the button labelled `label`, inside the card titled `card` if given. */
async function userClick(page: ExtensionPage, label: string, card?: string): Promise<void> {
  const within = card === undefined ? undefined : await cardSelector(page, card);
  await page.user.click(await buttonSelector(page, label, within));
}

async function userDelete(page: ExtensionPage, title: string): Promise<void> {
  await userClick(page, 'Delete', title);
  await userClick(page, 'Delete permanently', title);
  await expect.poll(async () => (await titles(page)()).includes(`page: ${title}`)).toBe(false);
}

const noteOf = (page: ExtensionPage, title: string) => async () =>
  (await readLibrary(page)).find((card) => card.title === title)?.note;

test('with the mouse, Export downloads a file the browser lists, and Import… restores deleted items', async ({
  extension,
}) => {
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);
  const saved = await titles(library)();

  const file = await library.download(() => library.user.click(EXPORT_BUTTON));
  expect(file.filename).toMatch(/^clipwise-export-\d{4}-\d{2}-\d{2}\.json$/);
  expect((JSON.parse(file.text) as { items: unknown[] }).items).toHaveLength(4);
  // The browser itself recorded a finished download (chrome://downloads, Firefox's Library).
  await expect
    .poll(() => extension.browserDownloads())
    .toContainEqual({
      url: expect.stringMatching(/^blob:(chrome|moz)-extension:\/\//) as unknown,
      complete: true,
    });

  await userDelete(library, 'Morning news');
  await userDelete(library, 'Café soup recipe');
  expect(await readLibrary(library)).toHaveLength(2);

  // Import… opens the browser's file chooser.
  await library.user.chooseFile(IMPORT_BUTTON, { name: file.filename, text: file.text });
  await expect
    .poll(summary(library))
    .toEqual(['2 new items to add', '2 items already in your library, unchanged']);
  await expect.poll(importButton(library)).toBe('Import 2 items');
  await userClick(library, 'Import 2 items');

  await expect
    .poll(notice(library))
    .toBe('Imported 2 new items. 2 items were already in your library. Dismiss');
  expect(await titles(library)()).toEqual(saved);
  expect(library.errors()).toEqual([]);
});

test('an older backup keeps newer edits unless the user chooses to replace them', async ({
  extension,
}) => {
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);
  await expect.poll(async () => (await readLibrary(library)).length).toBe(4);
  const backup = await library.download(() => library.user.click(EXPORT_BUTTON));

  // Changes made after the backup.
  await userClick(library, 'Edit note and tags', 'Morning news');
  await library.user.type('Read after lunch');
  await userClick(library, 'Save changes', 'Morning news');
  await expect.poll(noteOf(library, 'Morning news')).toBe('Read after lunch');
  await userDelete(library, 'Café soup recipe');

  // Restoring with the default choice brings back the deleted item and keeps the edit.
  await library.user.chooseFile(IMPORT_BUTTON, { name: backup.filename, text: backup.text });
  await expect
    .poll(summary(library))
    .toEqual([
      '1 new item to add',
      '2 items already in your library, unchanged',
      '1 item already in your library with a different title, note, tags, or text',
    ]);
  await expect.poll(importButton(library)).toBe('Import 1 item');
  await userClick(library, 'Import 1 item');
  await expect
    .poll(notice(library))
    .toBe(
      'Imported 1 new item. Kept your version of 1 item. 2 items were already in your library. Dismiss',
    );
  expect(await noteOf(library, 'Morning news')()).toBe('Read after lunch');
  expect(await readLibrary(library)).toHaveLength(4);

  // Choosing the backup's version replaces the edited item.
  await library.user.chooseFile(IMPORT_BUTTON, { name: backup.filename, text: backup.text });
  await expect.poll(summary(library)).toContain('0 new items to add');
  await library.user.click('input[name="conflict-policy"][value="replace"]');
  await expect
    .poll(() =>
      library.evaluate(
        () =>
          document.querySelector<HTMLInputElement>('input[name="conflict-policy"]:checked')?.value,
      ),
    )
    .toBe('replace');
  await expect.poll(importButton(library)).toBe('Import 1 item');
  await userClick(library, 'Import 1 item');
  await expect
    .poll(notice(library))
    .toBe('Replaced 1 item. 3 items were already in your library. Dismiss');
  expect(await noteOf(library, 'Morning news')()).toBeNull();
  expect(await storedRecord(library, 'news')).toEqual(LIBRARY['item:news']);
  expect(library.errors()).toEqual([]);
});
