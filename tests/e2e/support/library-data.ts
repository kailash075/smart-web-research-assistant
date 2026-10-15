import type { ExtensionPage } from './types';

// The `chrome` namespace exists in both browsers' extension pages.
declare const chrome: {
  storage: {
    local: {
      get: (keys: string | null) => Promise<Record<string, unknown>>;
      set: (items: Record<string, unknown>) => Promise<void>;
      clear: () => Promise<void>;
    };
  };
};

export function storedItem(id: string, fields: Record<string, unknown>): Record<string, unknown> {
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

/** Four saved items: three pages and a highlight, on three websites. */
export const LIBRARY = {
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
export const seed = (page: ExtensionPage, items: Record<string, unknown>) =>
  page.evaluate((items) => chrome.storage.local.set(items), items);

/** Deletes everything Clipwise stored, as a fresh install would have. */
export const clearStorage = (page: ExtensionPage) =>
  page.evaluate(() => chrome.storage.local.clear());

/** The stored record of one item. */
export const storedRecord = (page: ExtensionPage, id: string) =>
  page.evaluate(async (key) => (await chrome.storage.local.get(key))[key] ?? null, `item:${id}`);
