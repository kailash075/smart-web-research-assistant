import type { FacetCount } from '@/domain/library-query';
import { formatTagInput, normalizeTag, parseTagInput } from '@/domain/tags';

const MAX_SUGGESTIONS = 8;

type TagSuggestionsProps = {
  /** Tags already used in the library, with how many items use each. */
  tags: readonly FacetCount[];
  /** The current text of the tags field. */
  value: string;
  onChange: (value: string) => void;
};

/** One-click buttons that add the user's most-used tags to a tags field. */
export function TagSuggestions({ tags, value, onChange }: TagSuggestionsProps) {
  const typed = parseTagInput(value).map((tag) => tag.trim());
  const entered = new Set(typed.map(normalizeTag));
  const suggestions = [...tags]
    .filter((tag) => !entered.has(tag.value))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, MAX_SUGGESTIONS);
  if (suggestions.length === 0) return null;

  return (
    <div className="tag-suggestions" role="group" aria-label="Add one of your tags">
      {suggestions.map(({ value: tag }) => (
        <button
          key={tag}
          type="button"
          className="tag"
          onClick={() => {
            onChange(formatTagInput([...typed.filter((item) => item !== ''), tag]));
          }}
        >
          + {tag}
        </button>
      ))}
    </div>
  );
}
