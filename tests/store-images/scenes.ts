import { ARTICLE, DEMO_HOST, HIGHLIGHT } from './demo';

// HTML for each store image. Every PageNest screen in them is a real capture (popup,
// library); the browser window around it, the web page, and the right-click menu are
// drawn here, without any browser's own branding. Captures are placed at their natural
// size, so text stays sharp.

/** A PNG capture and its size in CSS pixels. */
export type Capture = { src: string; width: number; height: number };

export type SceneSize = { width: number; height: number };

const ICON_BLUE = '#4338ca';
const UI_FONT = "'Noto Sans', system-ui, sans-serif";

/** PageNest's icon (public/icon), drawn as SVG so it stays sharp at any size. */
function icon(size: number, { inverted = false } = {}): string {
  const tile = inverted ? '#ffffff' : ICON_BLUE;
  const mark = inverted ? ICON_BLUE : '#ffffff';
  return `<svg width="${String(size)}" height="${String(size)}" viewBox="4 4 120 120" aria-hidden="true">
    <rect x="4" y="4" width="120" height="120" rx="22" fill="${tile}"/>
    <path d="M40 28H88V100L64 81L40 100Z" fill="${mark}"/></svg>`;
}

function page(size: SceneSize, css: string, body: string, script = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: ${String(size.width)}px; height: ${String(size.height)}px; overflow: hidden; }
    body { font-family: ${UI_FONT}; -webkit-font-smoothing: antialiased; }
    ${css}
  </style></head><body>${body}<script>(() => {${script}})();</script></body></html>`;
}

// A 1280 × 800 screenshot: a caption, then a browser window that runs off the bottom.
const SCREENSHOT = { width: 1280, height: 800 } as const;
const WINDOW = { left: 72, top: 172, width: 1136, bar: 48 } as const;

type Theme = 'light' | 'dark';

function screenshotCss(theme: Theme): string {
  const dark = theme === 'dark';
  return `
    body { background: ${dark ? 'linear-gradient(160deg, #191a2e, #10111c)' : 'linear-gradient(160deg, #eef0ff, #f7f8fc 60%)'}; }
    .caption { position: absolute; left: ${String(WINDOW.left)}px; top: 52px; right: ${String(WINDOW.left)}px; }
    .caption h1 { font-size: 40px; line-height: 1.15; font-weight: 700; letter-spacing: -0.01em;
      color: ${dark ? '#f2f3f7' : '#161b33'}; }
    .caption p { margin-top: 10px; font-size: 20px; line-height: 1.4; color: ${dark ? '#a9adbd' : '#4b5168'}; }
    .window { position: absolute; left: ${String(WINDOW.left)}px; top: ${String(WINDOW.top)}px;
      width: ${String(WINDOW.width)}px; height: ${String(SCREENSHOT.height - WINDOW.top + 24)}px;
      border-radius: 14px; overflow: hidden;
      background: ${dark ? '#1e1f22' : '#ffffff'};
      box-shadow: 0 24px 64px rgba(22, 27, 51, ${dark ? '0.6' : '0.18'}), 0 0 0 1px rgba(${dark ? '255, 255, 255, 0.08' : '22, 27, 51, 0.08'}); }
    .bar { height: ${String(WINDOW.bar)}px; display: flex; align-items: center; gap: 16px; padding: 0 16px;
      background: ${dark ? '#2b2d31' : '#f3f4f8'}; border-bottom: 1px solid ${dark ? '#3a3c42' : '#e2e4ec'}; }
    .dots { display: flex; gap: 8px; }
    .dots i { width: 12px; height: 12px; border-radius: 50%; background: ${dark ? '#4a4d55' : '#d4d7e1'}; }
    .address { flex: 1; height: 32px; border-radius: 16px; display: flex; align-items: center; gap: 8px;
      padding: 0 14px; font-size: 14px; color: ${dark ? '#c9ccd4' : '#3b4054'};
      background: ${dark ? '#1e1f22' : '#ffffff'}; border: 1px solid ${dark ? '#3a3c42' : '#e2e4ec'}; }
    .address svg { flex: none; }
    .tool { width: 34px; height: 34px; border-radius: 8px; display: grid; place-items: center; position: relative; }
    .tool.pressed { background: ${dark ? '#3a3c42' : '#e3e5f1'}; }
    .badge { position: absolute; right: 0; bottom: 1px; min-width: 16px; height: 16px; border-radius: 8px;
      background: #1a7f37; color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; }
    .content { position: absolute; top: ${String(WINDOW.bar)}px; left: 0; right: 0; bottom: 0; overflow: hidden; }
  `;
}

function windowBar(address: string, { pressed = false, badge = false } = {}): string {
  const lock = `<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor"
    d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5A1.5 1.5 0 0 1 12.5 15h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm1.5 0h5V5a2.5 2.5 0 0 0-5 0v2Z"/></svg>`;
  return `<div class="bar"><span class="dots"><i></i><i></i><i></i></span>
    <div class="address">${lock}<span>${address}</span></div>
    <span class="tool${pressed ? ' pressed' : ''}">${icon(20)}${badge ? '<span class="badge">✓</span>' : ''}</span></div>`;
}

function caption(title: string, text: string): string {
  return `<header class="caption"><h1>${title}</h1><p>${text}</p></header>`;
}

const articleCss = `
  .article { background: #ffffff; height: 100%; padding: 44px 0 0; font-family: 'Noto Serif', Georgia, serif; color: #23262f; }
  .article > div { width: 660px; margin: 0 0 0 96px; position: relative; }
  .kicker { font-family: ${UI_FONT}; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #6b6f80; }
  .article h1 { margin-top: 12px; font-size: 38px; line-height: 1.2; font-weight: 700; color: #14161c; }
  .article p.body { margin-top: 18px; font-size: 18px; line-height: 1.7; }
  .article h2 { margin-top: 26px; font-size: 24px; color: #14161c; }
  .selected { background: #b3d4fc; }
`;

function article({ select = false } = {}): string {
  const [first, , third] = ARTICLE.paragraphs;
  const highlight = select
    ? `<span class="selected" id="selection">${HIGHLIGHT}</span>`
    : HIGHLIGHT;
  return `<div class="article"><div>
    <p class="kicker">${ARTICLE.kicker}</p><h1>${ARTICLE.title}</h1>
    <p class="body">${first}</p><p class="body">${highlight}</p><p class="body">${third}</p>
    <h2>${ARTICLE.subheading}</h2><p class="body">${ARTICLE.closing}</p></div></div>`;
}

const ARTICLE_ADDRESS = `${DEMO_HOST.replace(/^www\./, '')}${ARTICLE.path}`;

/** 1. The popup open over an article, with a note and tags typed in. */
export function savePageScene(popup: Capture): string {
  const css = `${screenshotCss('light')}${articleCss}
    .popup { position: absolute; top: 2px; right: 10px; width: ${String(popup.width)}px; height: ${String(popup.height)}px;
      overflow: hidden; border-radius: 10px; background: #fff;
      box-shadow: 0 18px 48px rgba(22, 27, 51, 0.28), 0 0 0 1px rgba(22, 27, 51, 0.1); }
    .popup img { display: block; }`;
  return page(
    SCREENSHOT,
    css,
    `${caption('Save any page in one click', 'Add a note and tags as you save, or press Alt+Shift+D to save without opening PageNest.')}
    <div class="window">${windowBar(ARTICLE_ADDRESS, { pressed: true })}
      <div class="content">${article()}<div class="popup"><img src="${popup.src}" width="${String(popup.width)}" alt=""></div></div>
    </div>`,
  );
}

/** 2. Selected text and the right-click menu with "Save selection to PageNest". */
export function saveSelectionScene(): string {
  const preview = `${HIGHLIGHT.slice(0, 22).trimEnd()}…`;
  const css = `${screenshotCss('light')}${articleCss}
    .menu { position: absolute; width: 300px; padding: 6px 0; border-radius: 8px; background: #ffffff;
      font-family: ${UI_FONT}; font-size: 14px; color: #1f2328;
      box-shadow: 0 12px 32px rgba(22, 27, 51, 0.22), 0 0 0 1px rgba(22, 27, 51, 0.1); }
    .menu div { height: 32px; display: flex; align-items: center; gap: 10px; padding: 0 16px 0 14px; white-space: nowrap; }
    .menu div .slot { width: 16px; flex: none; display: grid; place-items: center; }
    .menu div.active { background: #e8e9fb; }
    .menu hr { border: 0; border-top: 1px solid #e3e5ec; margin: 6px 0; }
    .cursor { position: absolute; width: 20px; height: 20px; }`;
  const item = (label: string, { active = false, withIcon = false } = {}) =>
    `<div${active ? ' class="active"' : ''}><span class="slot">${withIcon ? icon(16) : ''}</span>${label}</div>`;
  const menu = `<div class="menu" id="menu">${item('Copy')}${item(`Search the web for “${preview}”`)}${item('Print…')}
    <hr>${item('Save selection to PageNest', { active: true, withIcon: true })}<hr>${item('Inspect')}</div>`;
  const cursor = `<svg class="cursor" id="cursor" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 2l13 8.2-5.6 1.1 3.2 6.3-2.4 1.2-3.2-6.3L3 16.5Z"
    fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  // Place the menu where a right-click at the end of the selection would open it.
  const script = `
    const rects = document.getElementById('selection').getClientRects();
    const end = rects[rects.length - 1];
    const box = document.querySelector('.content').getBoundingClientRect();
    const menu = document.getElementById('menu');
    const left = Math.min(end.right - box.left - 24, box.width - 320);
    const top = end.bottom - box.top + 4;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    const active = menu.querySelector('.active').getBoundingClientRect();
    const cursor = document.getElementById('cursor');
    cursor.style.left = (active.right - box.left - 56) + 'px';
    cursor.style.top = (active.top - box.top + 12) + 'px';`;
  return page(
    SCREENSHOT,
    css,
    `${caption('Keep the passages that matter', 'Select text, right-click, and save it as a highlight with a link back to its page.')}
    <div class="window">${windowBar(ARTICLE_ADDRESS)}
      <div class="content">${article({ select: true })}${menu}${cursor}</div>
    </div>`,
    script,
  );
}

/** 3 and 4. The library page, cropped to the window (it is centred, so the sides go). */
export function libraryScene(
  library: Capture,
  theme: Theme,
  text: { title: string; subtitle: string },
): string {
  const css = `${screenshotCss(theme)}
    .content img { position: absolute; top: 0; left: ${String((WINDOW.width - library.width) / 2)}px; display: block; }`;
  return page(
    SCREENSHOT,
    css,
    `${caption(text.title, text.subtitle)}
    <div class="window">${windowBar('PageNest library')}
      <div class="content"><img src="${library.src}" width="${String(library.width)}" alt=""></div>
    </div>`,
  );
}

const PRIVACY_POINTS = [
  {
    title: 'Stays on your device',
    text: 'Pages and highlights live in your browser’s own storage. Nothing is uploaded.',
    path: 'M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v9a2.5 2.5 0 0 1-2.5 2.5H14v2h3v2H7v-2h3v-2H5.5A2.5 2.5 0 0 1 3 14.5Zm2.5-.5a.5.5 0 0 0-.5.5v9a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5Z',
  },
  {
    title: 'No account, no tracking',
    text: 'No sign-up, no servers, no analytics, and no ads. PageNest works offline.',
    path: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5Zm0 2.2 6 2.2V11c0 3.9-2.5 7.4-6 8.9-3.5-1.5-6-5-6-8.9V6.4Zm-1 9.4-2.3-2.3-1.4 1.4 3.7 3.7 5.7-5.7-1.4-1.4Z',
  },
  {
    title: 'Yours to keep',
    text: 'Export your library to a file at any time, and import it in another browser.',
    path: 'M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16 6.3 10.3l1.4-1.4L11 12.2ZM4 18h16v2H4Z',
  },
] as const;

/** 5. What PageNest does with your data. */
export function privacyScene(): string {
  const css = `
    body { background: linear-gradient(150deg, #4f46e5, #312e81 75%); color: #ffffff; }
    main { position: absolute; inset: 0; padding: 0 72px 40px; display: flex; flex-direction: column; justify-content: center; }
    .head { display: flex; align-items: center; gap: 20px; }
    h1 { font-size: 48px; font-weight: 700; letter-spacing: -0.01em; }
    .lead { margin-top: 18px; max-width: 760px; font-size: 22px; line-height: 1.5; color: rgba(255, 255, 255, 0.82); }
    .points { margin-top: 64px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .point { padding: 30px 28px 34px; border-radius: 18px; background: rgba(255, 255, 255, 0.09);
      border: 1px solid rgba(255, 255, 255, 0.18); }
    .point svg { display: block; }
    .point h2 { margin-top: 18px; font-size: 22px; font-weight: 700; }
    .point p { margin-top: 10px; font-size: 17px; line-height: 1.55; color: rgba(255, 255, 255, 0.8); }
    .foot { position: absolute; left: 72px; bottom: 56px; font-size: 16px; color: rgba(255, 255, 255, 0.7); }`;
  const points = PRIVACY_POINTS.map(
    ({ title, text, path }) =>
      `<section class="point"><svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffffff" d="${path}"/></svg>
      <h2>${title}</h2><p>${text}</p></section>`,
  ).join('');
  return page(
    SCREENSHOT,
    css,
    `<main><div class="head">${icon(64, { inverted: true })}<h1>Private by design</h1></div>
      <p class="lead">Everything you save with PageNest stays in your browser, on your device. It is never sent anywhere.</p>
      <div class="points">${points}</div>
      <p class="foot">For Chrome and Firefox on desktop</p></main>`,
  );
}

const TAGLINE = 'Save, organize, and rediscover the web.';

/** The Chrome Web Store's 440 × 280 promo tile. It must read well at half size. */
export function smallPromo(): string {
  const css = `
    body { background: linear-gradient(145deg, #5b52f0, #3730a3); color: #ffffff; }
    main { position: absolute; inset: 0; padding: 0 40px; display: flex; flex-direction: column; justify-content: center; }
    .name { display: flex; align-items: center; gap: 16px; }
    h1 { font-size: 46px; font-weight: 700; letter-spacing: -0.015em; }
    p { margin-top: 18px; font-size: 21px; line-height: 1.35; color: rgba(255, 255, 255, 0.88); max-width: 330px; }`;
  return page(
    { width: 440, height: 280 },
    css,
    `<main><div class="name">${icon(64, { inverted: true })}<h1>PageNest</h1></div><p>${TAGLINE}</p></main>`,
  );
}

// The library's centred column in a 1280-pixel-wide capture, with a little margin. The
// marquee shows that column, scaled down to fit beside the popup.
const LIBRARY_COLUMN = { left: 186, width: 908 } as const;
const LIBRARY_SHOT = { width: 600 } as const;

/** The Chrome Web Store's optional 1400 × 560 marquee: the name, then the popup and library. */
export function marqueePromo(popup: Capture, library: Capture): string {
  const scale = LIBRARY_SHOT.width / LIBRARY_COLUMN.width;
  const css = `
    body { background: linear-gradient(140deg, #5b52f0, #312e81 70%); color: #ffffff; }
    .text { position: absolute; left: 88px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; }
    .name { display: flex; align-items: center; gap: 20px; }
    h1 { font-size: 64px; font-weight: 700; letter-spacing: -0.02em; }
    .tagline { margin-top: 20px; font-size: 26px; line-height: 1.35; color: rgba(255, 255, 255, 0.9); }
    ul { margin-top: 30px; list-style: none; display: grid; gap: 12px; font-size: 19px; color: rgba(255, 255, 255, 0.82); }
    li::before { content: '✓'; margin-right: 12px; color: #c7d2fe; font-weight: 700; }
    .shot { position: absolute; overflow: hidden; border-radius: 12px; background: #fff;
      box-shadow: 0 28px 70px rgba(10, 10, 40, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12); }
    .shot img { display: block; position: absolute; top: 0; }
    .library { left: 740px; top: 64px; width: ${String(LIBRARY_SHOT.width)}px; height: 470px; }
    .library img { left: ${String(-LIBRARY_COLUMN.left * scale)}px; width: ${String(library.width * scale)}px; }
    .popup { left: 640px; top: 150px; width: ${String(popup.width)}px; height: 380px; }
    .popup img { left: 0; }`;
  return page(
    { width: 1400, height: 560 },
    css,
    `<div class="text"><div class="name">${icon(80, { inverted: true })}<h1>PageNest</h1></div>
      <p class="tagline">${TAGLINE}</p>
      <ul><li>Save pages and highlights in one click</li><li>Notes, tags, and instant search</li><li>Private: everything stays on your device</li></ul></div>
    <div class="shot library"><img src="${library.src}" width="${String(library.width)}" alt=""></div>
    <div class="shot popup"><img src="${popup.src}" width="${String(popup.width)}" alt=""></div>`,
  );
}
