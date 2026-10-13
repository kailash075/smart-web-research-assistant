const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** "13 Oct 2026, 09:00" in the user's locale and time zone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormat.format(date);
}

/** "13 Oct 2026" in the user's locale and time zone. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormat.format(date);
}

/** "1 item", "2 items"; pass `pluralNoun` for irregular plurals such as "matches". */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${String(count)} ${count === 1 ? noun : pluralNoun}`;
}
