import { expect, test } from './support/fixtures';

test('background script starts after install', async ({ extension }) => {
  expect(await extension.isBackgroundRunning()).toBe(true);
});

test('popup shows the extension name, version, and build target', async ({
  extension,
  manifest,
  browserName,
}) => {
  const popup = await extension.openPage('popup.html');

  const content = await popup.evaluate(() => ({
    heading: document.querySelector('h1')?.textContent ?? null,
    text: document.body.innerText,
  }));

  expect(content.heading).toBe(manifest.name);
  expect(content.text).toContain(manifest.version);
  expect(content.text).toContain(browserName === 'firefox' ? 'firefox · MV3' : 'chrome · MV3');
  expect(popup.errors()).toEqual([]);
});
