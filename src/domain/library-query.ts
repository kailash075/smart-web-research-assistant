import type { ResearchItem } from './research-item';
import { siteOf } from './url';

export type SortOrder = 'newest' | 'oldest';

/** What the user is looking for in the library. A `null` filter matches every item. */
export type LibraryQuery = {
  /** Free text; every word must appear in the title, URL, highlight, note, or tags. */
  text: string;
  tag: string | null;
  site: string | null;
  sort: SortOrder;
};

export const EMPTY_QUERY: LibraryQuery = { text: '', tag: null, site: null, sort: 'newest' };

/** A filter value and how many items have it. */
export type FacetCount = { value: string; count: number };

export type LibraryFacets = { tags: FacetCount[]; sites: FacetCount[] };

/** True when the query hides some items (sorting alone does not count). */
export function isFiltered(query: LibraryQuery): boolean {
  return searchTerms(query.text).length > 0 || query.tag !== null || query.site !== null;
}

export function queryLibrary(items: readonly ResearchItem[], query: LibraryQuery): ResearchItem[] {
  const terms = searchTerms(query.text);
  return items
    .filter(
      (item) =>
        (query.tag === null || item.tags.includes(query.tag)) &&
        (query.site === null || siteOfItem(item) === query.site) &&
        matchesTerms(item, terms),
    )
    .sort(query.sort === 'newest' ? (a, b) => compareAge(b, a) : compareAge);
}

/** Tags and websites present in the library, alphabetically, with item counts. */
export function libraryFacets(items: readonly ResearchItem[]): LibraryFacets {
  const tags = new Map<string, number>();
  const sites = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1);
    const site = siteOfItem(item);
    sites.set(site, (sites.get(site) ?? 0) + 1);
  }
  return { tags: toFacetCounts(tags), sites: toFacetCounts(sites) };
}

/** The website an item came from, e.g. `developer.mozilla.org`. */
export function siteOfItem(item: ResearchItem): string {
  try {
    return siteOf(new URL(item.url));
  } catch {
    return item.url;
  }
}

// Lowercase and without accents, so "cafe" finds "Café". A leading # is ignored so
// "#research" finds the tag "research".
function searchTerms(text: string): string[] {
  return foldForSearch(text)
    .split(/\s+/)
    .map((term) => term.replace(/^#+/, ''))
    .filter((term) => term !== '');
}

function matchesTerms(item: ResearchItem, terms: readonly string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = foldForSearch(
    [
      item.pageTitle,
      item.url,
      item.kind === 'highlight' ? item.text : '',
      item.note,
      ...item.tags,
    ].join('\n'),
  );
  return terms.every((term) => haystack.includes(term));
}

function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// Timestamps may differ in precision, so compare them as dates rather than strings.
// The id breaks ties so the order is stable.
function compareAge(a: ResearchItem, b: ResearchItem): number {
  return Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
}

function toFacetCounts(counts: ReadonlyMap<string, number>): FacetCount[] {
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value));
}
