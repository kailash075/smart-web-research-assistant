import { err, ok, type Result } from '@/shared/result';
import { issue, LIMITS, type ValidationIssue } from './validation';

const SAVEABLE_PROTOCOLS = new Set(['http:', 'https:']);

// Query parameters that only track where a click came from.
const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
]);
const TRACKING_PARAM_PREFIXES = ['utm_'];

/** Parses a URL the user can save: http(s) only, within the length limit. */
export function parseSaveableUrl(raw: string): Result<URL, ValidationIssue> {
  const trimmed = raw.trim();
  if (trimmed === '') return err(issue('url', 'required', 'The page address is missing.'));
  if (trimmed.length > LIMITS.urlLength) {
    return err(issue('url', 'too_long', 'The page address is too long to save.'));
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return err(issue('url', 'invalid_url', 'The page address is not a valid URL.'));
  }
  if (!SAVEABLE_PROTOCOLS.has(url.protocol)) {
    return err(issue('url', 'unsupported_url', 'Only web pages (http or https) can be saved.'));
  }
  return ok(url);
}

/**
 * The form of a URL used to spot duplicates: no tracking parameters and no
 * #fragment (fragments only scroll within a page), except hash-based app routes
 * such as `#/inbox` or `#!/inbox`, which identify different views.
 * Host case and default ports are already normalised by `URL`.
 */
export function comparableUrl(url: URL): string {
  const copy = new URL(url.href);
  for (const name of [...copy.searchParams.keys()]) {
    if (isTrackingParam(name)) copy.searchParams.delete(name);
  }
  if (!isHashRoute(copy.hash)) copy.hash = '';
  return copy.href;
}

/**
 * The address of the page the user is reading. Firefox's Reader View shows articles
 * at `about:reader?url=<address>`; this returns that inner address. Other addresses
 * are returned unchanged.
 */
export function originalPageUrl(raw: string): string {
  if (!raw.startsWith('about:reader?')) return raw;
  return new URLSearchParams(raw.slice('about:reader?'.length)).get('url') ?? raw;
}

/** Display name of the website, e.g. `developer.mozilla.org` (without `www.`). */
export function siteOf(url: URL): string {
  return url.hostname.replace(/^www\./, '');
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))
  );
}

function isHashRoute(hash: string): boolean {
  return hash.startsWith('#/') || hash.startsWith('#!/');
}
