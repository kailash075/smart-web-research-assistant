import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { clickButton, fill, readLibrary, textOf } from '../e2e/support/dom';
import { expect, test, type ExtensionPage } from '../e2e/support/fixtures';
import { seed } from '../e2e/support/library-data';
import {
  ARTICLE,
  ARTICLE_NOTE,
  ARTICLE_TAGS,
  ARTICLE_URL,
  articlePage,
  DEMO_HOST,
  DEMO_LIBRARY,
} from './demo';
import {
  libraryScene,
  marqueePromo,
  privacyScene,
  savePageScene,
  saveSelectionScene,
  smallPromo,
  type Capture,
  type SceneSize,
} from './scenes';

// Makes the images for the store listings (docs/publishing.md, "Images to prepare") in
// .output/store-images. Run with `pnpm store:images`. It captures PageNest's real popup
// and library in Chrome, with a made-up library, and places them in scenes.

const OUTPUT = resolve('.output/store-images');
const SCREENSHOT: SceneSize = { width: 1280, height: 800 };

test('store listing images', async ({ launchExtension, page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUTPUT, { recursive: true });
  const site = await startDemoSite();
  // The demo article opens at its own address, so the popup shows a real-looking site.
  // HTTPS upgrades are off because the demo site only speaks plain HTTP.
  const chromeArgs = [
    `--host-resolver-rules=MAP ${DEMO_HOST} 127.0.0.1:${String(site.port)}`,
    '--disable-features=HttpsUpgrades',
  ];
  try {
    const light = await launchExtension({ colorScheme: 'light', chromeArgs });
    const { extension } = light;
    const setup = await extension.openPage('library.html');
    await seed(setup, DEMO_LIBRARY);
    await setup.close();

    // The popup over the article, with a note and tags typed in.
    const popup = await extension.openPopup(await extension.openWebPage(ARTICLE_URL));
    await expect.poll(() => textOf(popup, '[data-testid="page-title"]')).toBe(ARTICLE.title);
    await fill(popup, 'textarea[name="note"]', ARTICLE_NOTE);
    await fill(popup, 'input[name="tags"]', ARTICLE_TAGS);
    await expect.poll(() => textOf(popup, '[aria-label="Add one of your tags"]')).toContain('+');
    // The version and build lines are for support requests, so the image leaves them out.
    await popup.evaluate(() => {
      for (const term of Array.from(document.querySelectorAll('.popup__meta dt'))) {
        if (term.textContent !== 'Version' && term.textContent !== 'Build') continue;
        for (const row of [term, term.nextElementSibling]) {
          if (row instanceof HTMLElement) row.style.display = 'none';
        }
      }
    });
    const popupCapture = await capture(popup, () =>
      Math.ceil(document.querySelector('main')?.getBoundingClientRect().bottom ?? innerHeight),
    );
    await clickButton(popup, 'Save page');
    await expect.poll(() => textOf(popup, '[data-testid="save-feedback"]')).toMatch(/saved/i);
    expect(popup.errors()).toEqual([]);

    // The whole library, with the article just saved at the top.
    const library = await extension.openPage('library.html');
    await expect.poll(async () => (await readLibrary(library))[0]?.title).toBe(ARTICLE.title);
    const libraryCapture = await capture(library);
    expect(library.errors()).toEqual([]);
    await light.close();

    // A search in the dark colour scheme.
    const dark = await launchExtension({ colorScheme: 'dark', chromeArgs });
    const darkLibrary = await dark.extension.openPage('library.html');
    // The search box appears once the saved items have loaded.
    await expect.poll(async () => (await readLibrary(darkLibrary)).length).toBe(8);
    await fill(darkLibrary, 'input[name="search"]', 'focus');
    await expect.poll(async () => (await readLibrary(darkLibrary)).length).toBe(2);
    const searchCapture = await capture(darkLibrary);
    expect(darkLibrary.errors()).toEqual([]);
    await dark.close();

    await render(page, 'screenshot-1-save-page.png', SCREENSHOT, savePageScene(popupCapture));
    await render(page, 'screenshot-2-save-selection.png', SCREENSHOT, saveSelectionScene());
    await render(
      page,
      'screenshot-3-library.png',
      SCREENSHOT,
      libraryScene(libraryCapture, 'light', {
        title: 'Everything in one tidy library',
        subtitle: 'Pages, highlights, notes, and tags, sorted and ready when you need them.',
      }),
    );
    await render(
      page,
      'screenshot-4-search.png',
      SCREENSHOT,
      libraryScene(searchCapture, 'dark', {
        title: 'Find it again in seconds',
        subtitle:
          'Search titles, highlights, notes, and tags. Light or dark, as your system prefers.',
      }),
    );
    await render(page, 'screenshot-5-private.png', SCREENSHOT, privacyScene());
    await render(page, 'promo-small-440x280.png', { width: 440, height: 280 }, smallPromo());
    await render(
      page,
      'promo-marquee-1400x560.png',
      { width: 1400, height: 560 },
      marqueePromo(popupCapture, libraryCapture),
    );
  } finally {
    await site.close();
  }
});

/**
 * A PNG of the page, as a data URL with its size. `height` optionally gives the height
 * to keep, computed inside the page (the scene crops the rest).
 */
async function capture(page: ExtensionPage, height?: () => number): Promise<Capture> {
  const png = await page.screenshot();
  const size = pngSize(png);
  const kept = height ? await page.evaluate(height) : size.height;
  // Captured at one image pixel per CSS pixel, so the scenes can place them unscaled.
  expect(size.width).toBe(await page.evaluate(() => innerWidth));
  return {
    src: `data:image/png;base64,${png.toString('base64')}`,
    width: size.width,
    height: Math.min(kept, size.height),
  };
}

async function render(page: Page, file: string, size: SceneSize, html: string): Promise<void> {
  const errors: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  page.on('pageerror', onError);
  await page.setViewportSize(size);
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const png = await page.screenshot();
  page.off('pageerror', onError);
  expect(errors, file).toEqual([]);
  expect(pngSize(png)).toEqual(size);
  writeFileSync(join(OUTPUT, file), png);
}

// A PNG's size is in its header: width and height as 32-bit numbers at bytes 16 and 20.
function pngSize(png: Buffer): SceneSize {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

async function startDemoSite(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer((request, response) => {
    if (request.url === ARTICLE.path) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(articlePage());
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    close: () =>
      new Promise<void>((closed) => {
        server.closeAllConnections();
        server.close(() => {
          closed();
        });
      }),
  };
}
