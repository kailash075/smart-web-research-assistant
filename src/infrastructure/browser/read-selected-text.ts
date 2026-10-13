/** What the page reports about the user's selection. */
export type SelectionReading =
  | { kind: 'text'; text: string }
  /** A password field has focus; its selection is never read. */
  | { kind: 'password' }
  /** The page cannot see the selection, as in Chrome's PDF viewer. */
  | { kind: 'unreadable' };

/**
 * Reads the text the user selected in the current frame.
 *
 * This function is injected into the web page with `scripting.executeScript`, which
 * sends its source code, so it must not use anything from outside its own body.
 */
export function readSelectedText(): SelectionReading {
  // Chrome shows PDFs in a plugin whose selection the page cannot see.
  if (document.contentType === 'application/pdf') return { kind: 'unreadable' };
  const active = document.activeElement;
  // Chrome reports a focused field's selection through window.getSelection() (masked
  // as "•••" for passwords), so stop before reading anything.
  if (active instanceof HTMLInputElement && active.type === 'password') {
    return { kind: 'password' };
  }
  // Firefox does not include text selected inside a text field in window.getSelection().
  const isTextField =
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && ['text', 'search', 'url', 'tel'].includes(active.type));
  if (isTextField) {
    const { selectionStart, selectionEnd, value } = active;
    if (selectionStart !== null && selectionEnd !== null && selectionEnd > selectionStart) {
      return { kind: 'text', text: value.slice(selectionStart, selectionEnd) };
    }
  }
  return { kind: 'text', text: window.getSelection()?.toString() ?? '' };
}
