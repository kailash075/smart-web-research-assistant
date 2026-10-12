import { beforeEach, describe, expect, it } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';

// Smoke test: proves the Vitest + WXT fake browser setup works before real tests exist.
describe('test environment', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('provides an in-memory browser.storage.local', async () => {
    await browser.storage.local.set({ greeting: 'hello' });

    const stored = await browser.storage.local.get('greeting');

    expect(stored).toEqual({ greeting: 'hello' });
  });

  it('starts every test with empty storage', async () => {
    const stored = await browser.storage.local.get(null);

    expect(stored).toEqual({});
  });
});
