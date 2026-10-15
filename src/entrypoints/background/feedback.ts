import { browser } from 'wxt/browser';
import type { AppError } from '@/application/errors';
import type { SaveOutcome } from '@/application/save-item';
import type { Result } from '@/shared/result';

// Saves from the context menu or a keyboard shortcut happen without the popup, so
// the result is shown on the toolbar button of that tab for a few seconds: a badge
// plus a tooltip with the full message. This needs no extra permission.

const FEEDBACK_DURATION_MS = 4_000;

type Feedback = { badge: string; color: string; message: string };

// Only lives while the background is awake; a lost timer just leaves the badge
// until the tab navigates.
const clearTimers = new Map<number, ReturnType<typeof setTimeout>>();

export async function showSaveFeedback(
  tabId: number,
  result: Result<SaveOutcome, AppError>,
): Promise<void> {
  const feedback = describe(result);
  if (!result.ok) console.warn(`[Clipwise] ${feedback.message}`);
  try {
    await Promise.all([
      browser.action.setBadgeBackgroundColor({ tabId, color: feedback.color }),
      browser.action.setBadgeText({ tabId, text: feedback.badge }),
      browser.action.setTitle({ tabId, title: `Clipwise: ${feedback.message}` }),
    ]);
  } catch {
    return; // The tab was closed in the meantime.
  }
  clearTimeout(clearTimers.get(tabId));
  clearTimers.set(
    tabId,
    setTimeout(() => {
      clearTimers.delete(tabId);
      void clearFeedback(tabId);
    }, FEEDBACK_DURATION_MS),
  );
}

async function clearFeedback(tabId: number): Promise<void> {
  try {
    // Without a tabId, getTitle returns the button's normal title.
    const defaultTitle = await browser.action.getTitle({});
    await Promise.all([
      browser.action.setBadgeText({ tabId, text: '' }),
      browser.action.setTitle({ tabId, title: defaultTitle }),
    ]);
  } catch {
    // The tab was closed in the meantime.
  }
}

function describe(result: Result<SaveOutcome, AppError>): Feedback {
  if (!result.ok) return { badge: '!', color: '#cf222e', message: result.error.message };
  const what = result.value.item.kind === 'page' ? 'Page' : 'Highlight';
  return result.value.status === 'saved'
    ? { badge: '✓', color: '#1a7f37', message: `${what} saved.` }
    : { badge: '✓', color: '#59636e', message: `${what} was already saved.` };
}
