import { describe, expect, it } from 'vitest';
import {
  EMPTY_QUERY,
  isFiltered,
  libraryFacets,
  queryLibrary,
  siteOfItem,
  type LibraryQuery,
} from '@/domain/library-query';
import type { ResearchItem } from '@/domain/research-item';
import { makeHighlight, makePage } from '../support/items';

const recipe = makePage({
  id: 'recipe',
  url: 'https://www.cooking.example/soup',
  pageTitle: 'Café soup recipe',
  tags: ['food'],
  createdAt: '2026-10-01T08:00:00.000Z',
});
const paper = makePage({
  id: 'paper',
  url: 'https://arxiv.example/abs/1234',
  pageTitle: 'Attention is all you need',
  note: 'Transformer architecture, re-read section 3',
  tags: ['ml', 'papers'],
  createdAt: '2026-10-03T08:00:00.000Z',
});
const quote = makeHighlight({
  id: 'quote',
  url: 'https://arxiv.example/abs/1234',
  pageTitle: 'Attention is all you need',
  text: 'The Transformer allows for significantly more parallelization.',
  tags: ['ml'],
  createdAt: '2026-10-02T08:00:00.000Z',
});
const items: ResearchItem[] = [recipe, paper, quote];

const ids = (results: readonly ResearchItem[]) => results.map((item) => item.id);
const search = (query: Partial<LibraryQuery>) =>
  ids(queryLibrary(items, { ...EMPTY_QUERY, ...query }));

describe('queryLibrary', () => {
  it('returns everything, newest first, for an empty query', () => {
    expect(search({})).toEqual(['paper', 'quote', 'recipe']);
  });

  it('sorts oldest first on request', () => {
    expect(search({ sort: 'oldest' })).toEqual(['recipe', 'quote', 'paper']);
  });

  it('searches titles, addresses, highlight text, notes, and tags', () => {
    expect(search({ text: 'soup' })).toEqual(['recipe']); // title
    expect(search({ text: 'arxiv' })).toEqual(['paper', 'quote']); // address
    expect(search({ text: 'parallelization' })).toEqual(['quote']); // highlight
    expect(search({ text: 'section 3' })).toEqual(['paper']); // note
    expect(search({ text: 'papers' })).toEqual(['paper']); // tag
  });

  it('requires every word to match, in any order, ignoring case and accents', () => {
    expect(search({ text: 'TRANSFORMER  section' })).toEqual(['paper']);
    expect(search({ text: 'cafe' })).toEqual(['recipe']);
    expect(search({ text: 'transformer soup' })).toEqual([]);
  });

  it('ignores a leading # so tag searches work', () => {
    expect(search({ text: '#food' })).toEqual(['recipe']);
  });

  it('filters by tag and by website (without www.)', () => {
    expect(search({ tag: 'ml' })).toEqual(['paper', 'quote']);
    expect(search({ site: 'cooking.example' })).toEqual(['recipe']);
    expect(search({ tag: 'ml', site: 'cooking.example' })).toEqual([]);
  });

  it('combines text and filters', () => {
    expect(search({ text: 'parallelization', tag: 'ml', site: 'arxiv.example' })).toEqual([
      'quote',
    ]);
  });

  it('compares timestamps as dates even when their precision differs', () => {
    const early = makePage({ id: 'b', createdAt: '2026-10-13T09:00:00Z' });
    const late = makePage({ id: 'a', createdAt: '2026-10-13T09:00:00.500Z' });
    expect(ids(queryLibrary([early, late], EMPTY_QUERY))).toEqual(['a', 'b']);
  });

  it('keeps a stable order for items saved at the same moment', () => {
    const first = makePage({ id: 'a' });
    const second = makePage({ id: 'b' });
    expect(ids(queryLibrary([second, first], { ...EMPTY_QUERY, sort: 'oldest' }))).toEqual([
      'a',
      'b',
    ]);
  });

  it('does not reorder the input array', () => {
    const input = [recipe, paper];
    queryLibrary(input, EMPTY_QUERY);
    expect(ids(input)).toEqual(['recipe', 'paper']);
  });
});

describe('isFiltered', () => {
  it('is false for an empty query, whitespace, or only a sort change', () => {
    expect(isFiltered(EMPTY_QUERY)).toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, text: '   ' })).toBe(false);
    expect(isFiltered({ ...EMPTY_QUERY, sort: 'oldest' })).toBe(false);
  });

  it('is true when text, a tag, or a website narrows the list', () => {
    expect(isFiltered({ ...EMPTY_QUERY, text: 'x' })).toBe(true);
    expect(isFiltered({ ...EMPTY_QUERY, tag: 'ml' })).toBe(true);
    expect(isFiltered({ ...EMPTY_QUERY, site: 'arxiv.example' })).toBe(true);
  });
});

describe('libraryFacets', () => {
  it('lists tags and websites alphabetically with item counts', () => {
    expect(libraryFacets(items)).toEqual({
      tags: [
        { value: 'food', count: 1 },
        { value: 'ml', count: 2 },
        { value: 'papers', count: 1 },
      ],
      sites: [
        { value: 'arxiv.example', count: 2 },
        { value: 'cooking.example', count: 1 },
      ],
    });
  });
});

describe('siteOfItem', () => {
  it('returns the host name without www.', () => {
    expect(siteOfItem(recipe)).toBe('cooking.example');
  });
});
