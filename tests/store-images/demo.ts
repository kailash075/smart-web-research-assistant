import { storedItem } from '../e2e/support/library-data';

// Made-up content for the store listing images: an article to save and a library of
// earlier saves. Every site, title, and text here is invented for the images.

/** Chrome resolves this name to the local demo site, so the popup shows a real-looking site. */
export const DEMO_HOST = 'www.fieldnotes-journal.com';

export const ARTICLE = {
  path: '/deep-focus',
  title: 'The quiet power of deep focus',
  kicker: 'Field Notes · Work · 6 min read',
  paragraphs: [
    'Most of us spend the day switching between tabs, messages, and half-finished tasks. Each switch feels small, but together they leave little room for the kind of thinking that solves hard problems.',
    'Attention is like a muscle: it grows stronger when you protect it from constant interruption.',
    'People who improve fastest tend to work in long, uninterrupted blocks, and they decide in advance what each block is for.',
  ],
  subheading: 'Start with one protected hour',
  closing:
    'Pick the hour when you have the most energy, close everything you do not need, and keep a notepad nearby for stray thoughts. When the hour ends, write down where you stopped, so tomorrow starts with momentum.',
} as const;

/** The article's address. Chrome maps DEMO_HOST, port included, to the demo site. */
export const ARTICLE_URL = `http://${DEMO_HOST}${ARTICLE.path}`;

/** The passage the images show being saved as a highlight. */
export const HIGHLIGHT = ARTICLE.paragraphs[1];

/** What the popup image shows typed in before saving the article. */
export const ARTICLE_NOTE = 'Try the protected hour next week';
export const ARTICLE_TAGS = 'focus, work';

/** The article as a web page, for the demo site. */
export function articlePage(): string {
  const [first, second, third] = ARTICLE.paragraphs;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>${ARTICLE.title}</title></head><body>
    <p>${ARTICLE.kicker}</p><h1>${ARTICLE.title}</h1>
    <p>${first}</p><p>${second}</p><p>${third}</p>
    <h2>${ARTICLE.subheading}</h2><p>${ARTICLE.closing}</p></body></html>`;
}

const day = (date: number, hour: number) =>
  new Date(Date.UTC(2026, 9, date, hour, 15)).toISOString();

/** Earlier saves, in the stored format. The article itself is saved through the popup. */
export const DEMO_LIBRARY = {
  ...storedItem('demo-highlight-focus', {
    kind: 'highlight',
    url: ARTICLE_URL,
    pageTitle: ARTICLE.title,
    text: HIGHLIGHT,
    tags: ['focus'],
    createdAt: day(20, 9),
  }),
  ...storedItem('demo-soup', {
    url: 'https://www.slowkitchen.co/lentil-soup',
    pageTitle: 'Weeknight lentil soup with lemon and herbs',
    note: 'Double the lemon',
    tags: ['recipes'],
    createdAt: day(19, 17),
  }),
  ...storedItem('demo-kyoto-quote', {
    kind: 'highlight',
    url: 'https://www.quietroutes.com/kyoto-autumn',
    pageTitle: 'Kyoto in autumn: a slow travel guide',
    text: 'Arrive at Fushimi Inari before seven in the morning to walk the gates in near silence.',
    tags: ['travel'],
    createdAt: day(18, 8),
  }),
  ...storedItem('demo-kyoto', {
    url: 'https://www.quietroutes.com/kyoto-autumn',
    pageTitle: 'Kyoto in autumn: a slow travel guide',
    note: 'Book the Arashiyama stay early',
    tags: ['travel', 'japan'],
    createdAt: day(18, 7),
  }),
  ...storedItem('demo-transformers', {
    url: 'https://www.learnml.net/transformers-explained',
    pageTitle: 'Transformers, explained with pictures',
    note: 'Section 3 explains attention',
    tags: ['ml', 'reading'],
    createdAt: day(15, 20),
  }),
  ...storedItem('demo-docs', {
    url: 'https://www.clearwriting.guide/documentation',
    pageTitle: 'How to write documentation people actually read',
    tags: ['writing', 'work'],
    createdAt: day(14, 11),
  }),
  ...storedItem('demo-stretch', {
    url: 'https://www.movewell.health/morning-stretch',
    pageTitle: 'A 10-minute morning stretch routine',
    tags: ['health'],
    createdAt: day(12, 6),
  }),
};
