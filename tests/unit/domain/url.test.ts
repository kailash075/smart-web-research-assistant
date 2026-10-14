import { describe, expect, it } from 'vitest';
import { comparableUrl, originalPageUrl, parseSaveableUrl, siteOf } from '@/domain/url';

describe('parseSaveableUrl', () => {
  it.each(['https://example.com/a?b=1#c', 'http://localhost:3000/', '  https://example.com  '])(
    'accepts %j',
    (raw) => {
      expect(parseSaveableUrl(raw).ok).toBe(true);
    },
  );

  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['not a url', 'invalid_url'],
    ['chrome://extensions', 'unsupported_url'],
    ['about:addons', 'unsupported_url'],
    ['javascript:alert(1)', 'unsupported_url'],
    ['file:///home/me/notes.html', 'unsupported_url'],
    ['moz-extension://abc/popup.html', 'unsupported_url'],
    [`https://example.com/${'a'.repeat(9_000)}`, 'too_long'],
  ])('rejects %j with %s', (raw, code) => {
    const result = parseSaveableUrl(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(code);
      expect(result.error.field).toBe('url');
    }
  });
});

describe('comparableUrl', () => {
  const compare = (raw: string) => comparableUrl(new URL(raw));

  it('drops the #fragment', () => {
    expect(compare('https://example.com/page#section-2')).toBe('https://example.com/page');
  });

  it('keeps hash-based app routes', () => {
    expect(compare('https://app.example.com/#/inbox')).toBe('https://app.example.com/#/inbox');
    expect(compare('https://app.example.com/#!/inbox')).toBe('https://app.example.com/#!/inbox');
  });

  it('removes tracking parameters but keeps meaningful ones', () => {
    expect(compare('https://example.com/p?id=7&utm_source=x&UTM_Medium=y&fbclid=z&gclid=q')).toBe(
      'https://example.com/p?id=7',
    );
  });

  it('normalises host case and default ports', () => {
    expect(compare('https://EXAMPLE.com:443/Path')).toBe('https://example.com/Path');
  });
});

describe('siteOf', () => {
  it('returns the hostname without www.', () => {
    expect(siteOf(new URL('https://www.example.com/a'))).toBe('example.com');
    expect(siteOf(new URL('https://docs.example.com/a'))).toBe('docs.example.com');
  });
});

describe('originalPageUrl', () => {
  it('returns the article address behind a Firefox Reader View page', () => {
    const article = 'https://example.com/news/story?id=7&lang=en';
    expect(originalPageUrl(`about:reader?url=${encodeURIComponent(article)}`)).toBe(article);
  });

  it.each(['https://example.com/page', 'about:reader', 'about:reader?other=1', 'about:addons'])(
    'leaves %j as it is',
    (raw) => {
      expect(originalPageUrl(raw)).toBe(raw);
    },
  );
});
