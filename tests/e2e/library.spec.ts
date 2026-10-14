import { clickButton, fill, readLibrary, textOf } from './support/dom';
import { expect, test, type ExtensionPage } from './support/fixtures';
import { LIBRARY, seed } from './support/library-data';

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
