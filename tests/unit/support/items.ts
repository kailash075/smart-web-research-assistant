import type { HighlightItem, PageItem } from '@/domain/research-item';

export const NOW = '2026-10-13T09:00:00.000Z';
export const LATER = '2026-10-14T10:30:00.000Z';

export function makePage(overrides: Partial<PageItem> = {}): PageItem {
  return {
    id: 'page-1',
    kind: 'page',
    url: 'https://example.com/article',
    pageTitle: 'An article',
    note: '',
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeHighlight(overrides: Partial<HighlightItem> = {}): HighlightItem {
  return {
    id: 'highlight-1',
    kind: 'highlight',
    url: 'https://example.com/article',
    pageTitle: 'An article',
    text: 'A quoted sentence.',
    note: '',
    tags: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}
