import { expect, test } from './support/fixtures';

// Clipwise's manifest gives its pages a content security policy with `connect-src 'none'`
// and `default-src 'self'`, so the browser itself stops them from sending anything over
// the network. The local test site records every request that reaches it.

// Tries three ways a page can send data out, and reports what the page saw for the two
// that report failure (a beacon is queued either way; only the site can tell whether it
// arrived). Runs in the page.
async function trySending(url: string): Promise<string[]> {
  const outcomes: string[] = [];
  try {
    await fetch(`${url}-fetch`, { mode: 'no-cors' });
    outcomes.push('fetch sent');
  } catch {
    outcomes.push('fetch blocked');
  }
  navigator.sendBeacon(`${url}-beacon`, 'data');
  const image = new Image();
  image.src = `${url}-image`;
  outcomes.push(
    await new Promise<string>((resolve) => {
      image.onload = () => {
        resolve('image loaded');
      };
      image.onerror = () => {
        resolve('image blocked');
      };
    }),
  );
  return outcomes;
}

test("Clipwise's own pages cannot send anything over the network", async ({ extension, site }) => {
  // The same attempts from a web page reach the site, so the check below is meaningful.
  const article = await extension.openWebPage(site.url('/article.html'));
  await article.evaluate(trySending, site.url('/from-web-page'));
  await expect
    .poll(() =>
      site
        .requests()
        .filter((path) => path.startsWith('/from-web-page'))
        .sort(),
    )
    .toEqual(['/from-web-page-beacon', '/from-web-page-fetch', '/from-web-page-image']);

  for (const path of ['library.html', 'popup.html']) {
    const page = await extension.openPage(path);
    expect(await page.evaluate(trySending, site.url(`/from-${path}`))).toEqual([
      'fetch blocked',
      'image blocked',
    ]);
  }
  // A beacon is sent after the page asks, so give a blocked one time to show up anyway.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect(
    site.requests().filter((path) => path.startsWith('/from-') && path.includes('.html')),
  ).toEqual([]);
});
