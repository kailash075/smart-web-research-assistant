import { clickButton, fill, readLibrary, textOf } from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';

// The `chrome` namespace exists in both browsers' extension pages.
declare const chrome: {
  storage: { local: { set: (items: Record<string, unknown>) => Promise<void> } };
};

function storedItem(id: string, fields: Record<string, unknown>): Record<string, unknown> {
  return {
    [`item:${id}`]: {
      id,
      kind: 'page',
      note: '',
      tags: [],
      updatedAt: fields['createdAt'],
      ...fields,
    },
  };
}

const LIBRARY = {
  ...storedItem('recipe', {
    url: 'https://www.cooking.example/soup',
    pageTitle: 'Café soup recipe',
    tags: ['food'],
    createdAt: '2026-10-01T08:00:00.000Z',
  }),
  ...storedItem('paper', {
    url: 'https://arxiv.example/abs/1234',
    pageTitle: 'Attention is all you need',
    note: 'Transformer architecture, re-read section 3',
    tags: ['ml', 'papers'],
    createdAt: '2026-10-03T08:00:00.000Z',
  }),
  ...storedItem('quote', {
    kind: 'highlight',
    url: 'https://arxiv.example/abs/1234',
    pageTitle: 'Attention is all you need',
    text: 'The Transformer allows for significantly more parallelization.',
    tags: ['ml'],
    createdAt: '2026-10-02T08:00:00.000Z',
  }),
  ...storedItem('news', {
    url: 'https://news.example/today',
    pageTitle: 'Morning news',
    createdAt: '2026-10-04T08:00:00.000Z',
  }),
};

// Writes records in the stored format, as an older version or another window would.
const seed = (page: ExtensionPage, items: Record<string, unknown>) =>
  page.evaluate((items) => chrome.storage.local.set(items), items);

const cardsOf = (page: ExtensionPage) => async () =>
  (await readLibrary(page)).map((card) => `${card.kind ?? ''}: ${card.title}`);

const countOf = (page: ExtensionPage) => () => textOf(page, '[data-testid="result-count"]');

test('an empty library explains how to save', async ({ extension }) => {
  const library = await extension.openPage('library.html');

  await expect
    .poll(() => textOf(library, '[data-testid="empty-library"] h2'))
    .toBe('Your library is empty');
  expect(await textOf(library, 'form[role="search"]')).toBeNull();
  expect(library.errors()).toEqual([]);
});

test('searches, filters, and sorts saved items', async ({ extension }) => {
  const library = await extension.openPage('library.html');
  await seed(library, LIBRARY);

  // Newest first by default.
  await expect
    .poll(cardsOf(library))
    .toEqual([
      'page: Morning news',
      'page: Attention is all you need',
      'highlight: Attention is all you need',
      'page: Café soup recipe',
    ]);
  expect(await countOf(library)()).toBe('Showing all 4 items');

  // Search covers notes and highlight text, and ignores case and accents.
  await fill(library, 'input[name="search"]', 'TRANSFORMER');
  await expect
    .poll(cardsOf(library))
    .toEqual(['page: Attention is all you need', 'highlight: Attention is all you need']);
  expect(await countOf(library)()).toBe('2 matches out of 4 items');
  await fill(library, 'input[name="search"]', 'cafe');
  await expect.poll(cardsOf(library)).toEqual(['page: Café soup recipe']);

  // No results, then clearing everything.
  await fill(library, 'input[name="search"]', 'nothing matches this');
  await expect
    .poll(() => textOf(library, '[data-testid="no-results"] h2'))
    .toBe('No matching items');
  await clickButton(library, 'Clear search and filters');
  await expect.poll(countOf(library)).toBe('Showing all 4 items');

  // Filters by tag and website.
  await fill(library, 'select[name="tag"]', 'ml');
  await expect
    .poll(cardsOf(library))
    .toEqual(['page: Attention is all you need', 'highlight: Attention is all you need']);
  await fill(library, 'select[name="site"]', 'arxiv.example');
  await fill(library, 'select[name="tag"]', '');
  await expect.poll(countOf(library)).toBe('2 matches out of 4 items');
  await fill(library, 'select[name="site"]', 'cooking.example');
  await expect.poll(cardsOf(library)).toEqual(['page: Café soup recipe']);
  await clickButton(library, 'Clear filters');

  // Oldest first.
  await fill(library, 'select[name="sort"]', 'oldest');
  await expect
    .poll(cardsOf(library))
    .toEqual([
      'page: Café soup recipe',
      'highlight: Attention is all you need',
      'page: Attention is all you need',
      'page: Morning news',
    ]);

  // Clicking a tag on a card filters by it.
  await clickButton(library, '#food');
  await expect.poll(cardsOf(library)).toEqual(['page: Café soup recipe']);
  expect(
    await library.evaluate(
      () => document.querySelector<HTMLSelectElement>('select[name="tag"]')?.value,
    ),
  ).toBe('food');
  expect(library.errors()).toEqual([]);
});

test('edits notes and tags, and deletes only after confirmation', async ({ extension }) => {
  const library = await extension.openPage('library.html');
  await seed(library, { 'item:paper': LIBRARY['item:paper'] });
  await expect.poll(cardsOf(library)).toEqual(['page: Attention is all you need']);

  // Edit and save.
  await clickButton(library, 'Edit note and tags');
  await fill(library, '.item__editor textarea[name="note"]', 'Read with the team');
  await fill(library, '.item__editor input[name="tags"]', 'ml, Reading List, ml');
  await clickButton(library, 'Save changes');
  await expect
    .poll(async () => (await readLibrary(library))[0])
    .toMatchObject({ note: 'Read with the team', tags: ['#ml', '#reading list'] });

  // Invalid input is explained and nothing is saved.
  await clickButton(library, 'Edit note and tags');
  await fill(library, '.item__editor input[name="tags"]', 'x'.repeat(41));
  await clickButton(library, 'Save changes');
  await expect
    .poll(() => textOf(library, '.item__editor [role="alert"]'))
    .toContain('longer than 40 characters');
  await clickButton(library, 'Cancel');
  await expect
    .poll(async () => (await readLibrary(library))[0]?.tags)
    .toEqual(['#ml', '#reading list']);

  // Changes are stored, so another library tab shows them too.
  const otherTab = await extension.openPage('library.html');
  await expect
    .poll(async () => (await readLibrary(otherTab))[0])
    .toMatchObject({ note: 'Read with the team', tags: ['#ml', '#reading list'] });

  // Delete asks first; cancelling keeps the item.
  await clickButton(library, 'Delete');
  await expect
    .poll(() => textOf(library, '[aria-label="Confirm delete"] span'))
    .toBe('Delete this page permanently?');
  await clickButton(library, 'Cancel');
  await expect.poll(cardsOf(library)).toEqual(['page: Attention is all you need']);

  await clickButton(library, 'Delete');
  await clickButton(library, 'Delete permanently');
  await expect
    .poll(() => textOf(library, '[data-testid="empty-library"] h2'))
    .toBe('Your library is empty');
  // The other tab updates without a reload.
  await expect
    .poll(() => textOf(otherTab, '[data-testid="empty-library"] h2'))
    .toBe('Your library is empty');
  expect(library.errors()).toEqual([]);
});
