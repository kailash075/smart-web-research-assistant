import {
  isFiltered,
  type FacetCount,
  type LibraryFacets,
  type LibraryQuery,
} from '@/domain/library-query';

type ToolbarProps = {
  query: LibraryQuery;
  facets: LibraryFacets;
  onChange: (query: LibraryQuery) => void;
  onClear: () => void;
};

export function Toolbar({ query, facets, onChange, onClear }: ToolbarProps) {
  return (
    <form
      className="toolbar"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <label className="field toolbar__search">
        <span className="field__label">Search</span>
        <input
          className="field__input"
          name="search"
          type="search"
          placeholder="Titles, addresses, highlights, notes, tags"
          value={query.text}
          onChange={(event) => {
            onChange({ ...query, text: event.target.value });
          }}
        />
      </label>
      <label className="field">
        <span className="field__label">Tag</span>
        <select
          className="field__input"
          name="tag"
          value={query.tag ?? ''}
          onChange={(event) => {
            onChange({ ...query, tag: emptyToNull(event.target.value) });
          }}
        >
          <option value="">All tags</option>
          {withSelected(facets.tags, query.tag).map(({ value, count }) => (
            <option key={value} value={value}>
              {value} ({count})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Website</span>
        <select
          className="field__input"
          name="site"
          value={query.site ?? ''}
          onChange={(event) => {
            onChange({ ...query, site: emptyToNull(event.target.value) });
          }}
        >
          <option value="">All websites</option>
          {withSelected(facets.sites, query.site).map(({ value, count }) => (
            <option key={value} value={value}>
              {value} ({count})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Sort</span>
        <select
          className="field__input"
          name="sort"
          value={query.sort}
          onChange={(event) => {
            onChange({ ...query, sort: event.target.value === 'oldest' ? 'oldest' : 'newest' });
          }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </label>
      <button type="button" className="button" disabled={!isFiltered(query)} onClick={onClear}>
        Clear filters
      </button>
    </form>
  );
}

function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

// Keeps the chosen filter visible even after its last item was deleted.
function withSelected(facets: readonly FacetCount[], selected: string | null): FacetCount[] {
  if (selected === null || facets.some((facet) => facet.value === selected)) return [...facets];
  return [...facets, { value: selected, count: 0 }];
}
