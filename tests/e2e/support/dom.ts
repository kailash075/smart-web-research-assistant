import type { Page } from '@playwright/test';
import type { ExtensionPage } from './types';

// Helpers that interact with extension pages by running code inside them. Firefox
// tests cannot click or type in extension pages through WebDriver, so both browsers
// use these, which keeps the tests identical. Each function passed to `evaluate` is
// sent as source text and must be self-contained.

/** Sets a field's value the way typing would, so React sees the change. */
export function fill(page: ExtensionPage, selector: string, value: string): Promise<void> {
  return page.evaluate(
    ([selector, value]) => {
      const field = document.querySelector(selector);
      if (!(
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement ||
        field instanceof HTMLSelectElement
      )) {
        throw new Error(`No form field matches ${selector}`);
      }
      // React tracks the value property, so set it through the prototype's setter.
      const prototype: unknown = Object.getPrototypeOf(field);
      if (typeof prototype !== 'object' || prototype === null) throw new Error('No prototype');
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
      const type = field instanceof HTMLSelectElement ? 'change' : 'input';
      field.dispatchEvent(new Event(type, { bubbles: true }));
    },
    [selector, value] as const,
  );
}

/** Clicks the enabled button whose text is `label`, inside the first `within` match. */
export function clickButton(page: ExtensionPage, label: string, within = 'body'): Promise<void> {
  return page.evaluate(
    ([label, within]) => {
      const buttons = [...(document.querySelector(within)?.querySelectorAll('button') ?? [])];
      const button = buttons.find((candidate) => candidate.textContent.trim() === label);
      if (!button) throw new Error(`No button "${label}" in ${within}`);
      if (button.disabled) throw new Error(`Button "${label}" is disabled`);
      button.click();
    },
    [label, within] as const,
  );
}

/**
 * A selector for the enabled button whose text is `label`, inside the first `within`
 * match, for real input (`page.user.click`). The button is marked with an attribute.
 */
export function buttonSelector(
  page: ExtensionPage,
  label: string,
  within = 'body',
): Promise<string> {
  return page.evaluate(
    ([label, within]) => {
      const buttons = [...(document.querySelector(within)?.querySelectorAll('button') ?? [])];
      const button = buttons.find((candidate) => candidate.textContent.trim() === label);
      if (!button) throw new Error(`No button "${label}" in ${within}`);
      if (button.disabled) throw new Error(`Button "${label}" is disabled`);
      const mark = String(Date.now() + Math.random());
      button.setAttribute('data-e2e-button', mark);
      return `[data-e2e-button="${mark}"]`;
    },
    [label, within] as const,
  );
}

/** A selector for the library card titled `title`. The card is marked with an attribute. */
export function cardSelector(page: ExtensionPage, title: string): Promise<string> {
  return page.evaluate((title) => {
    const card = [...document.querySelectorAll('[data-testid="library-item"]')].find(
      (candidate) => candidate.querySelector('[data-testid="item-title"]')?.textContent === title,
    );
    if (!card) throw new Error(`No library card titled "${title}"`);
    const mark = String(Date.now() + Math.random());
    card.setAttribute('data-e2e-card', mark);
    return `[data-e2e-card="${mark}"]`;
  }, title);
}

/**
 * Like `clickButton`, for a button that closes the page it is on (such as the popup's
 * "Show in library"). The click waits half a second, so the test has read this call's
 * result (Firefox tests poll for it) before the page goes away.
 */
export function clickButtonThatCloses(page: ExtensionPage, label: string): Promise<void> {
  return page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent.trim() === label,
    );
    if (!button || button.disabled) throw new Error(`No enabled button "${label}"`);
    setTimeout(() => {
      button.click();
    }, 500);
  }, label);
}

/** The trimmed text of the first element matching `selector`, or null if there is none. */
export function textOf(page: ExtensionPage, selector: string): Promise<string | null> {
  return page.evaluate(
    (selector) => document.querySelector(selector)?.textContent.trim() ?? null,
    selector,
  );
}

export function isDisabled(page: ExtensionPage, selector: string): Promise<boolean> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLButtonElement)) throw new Error(`No button matches ${selector}`);
    return element.disabled;
  }, selector);
}

export type LibraryCard = {
  kind: string | null;
  title: string;
  site: string;
  text: string | null;
  note: string | null;
  tags: string[];
};

/** The library page's item cards, top to bottom. */
export function readLibrary(page: ExtensionPage): Promise<LibraryCard[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="library-item"]')].map((card) => {
      const text = (testId: string) =>
        card.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
      return {
        kind: card.getAttribute('data-kind'),
        title: text('item-title') ?? '',
        site: text('item-site') ?? '',
        text: text('item-text'),
        note: text('item-note'),
        tags: [...card.querySelectorAll('.item__tags button')].map((tag) => tag.textContent),
      };
    }),
  );
}

/** Selects the text of an element in a web page, like dragging over it with the mouse. */
export function selectText(page: Page, selector: string): Promise<void> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) throw new Error(`Nothing matches ${selector}`);
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, selector);
}

/** Selects part of a text field's value, like dragging inside the field. */
export function selectInField(
  page: Page,
  selector: string,
  start: number,
  end: number,
): Promise<void> {
  return page.evaluate(
    ([selector, start, end]) => {
      const field = document.querySelector(selector);
      if (!(field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement)) {
        throw new Error(`No text field matches ${selector}`);
      }
      field.focus();
      field.setSelectionRange(start, end);
    },
    [selector, start, end] as const,
  );
}

export function clearSelection(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.getSelection()?.removeAllRanges();
  });
}

/** Chooses a file in a file input, as picking it in the file dialog would. */
export function chooseFile(
  page: ExtensionPage,
  selector: string,
  file: { name: string; text: string },
): Promise<void> {
  return page.evaluate(
    ([selector, name, text]) => {
      const input = document.querySelector(selector);
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
        throw new Error(`No file input matches ${selector}`);
      }
      const transfer = new DataTransfer();
      transfer.items.add(new File([text], name, { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [selector, file.name, file.text] as const,
  );
}

/** Clicks the first element matching `selector` (for example a radio button). */
export function click(page: ExtensionPage, selector: string): Promise<void> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) throw new Error(`Nothing matches ${selector}`);
    element.click();
  }, selector);
}

/** Describes the focused element, for example `button: Delete` or `input[name=search]`. */
export function focused(page: ExtensionPage): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return 'body';
    const name = element.getAttribute('name');
    if (name !== null) return `${element.tagName.toLowerCase()}[name=${name}]`;
    const testId = element.closest('[data-testid]')?.getAttribute('data-testid');
    const label = element.textContent.trim().slice(0, 40);
    return `${element.tagName.toLowerCase()}${testId ? ` in ${testId}` : ''}: ${label}`;
  });
}
