import { browser } from 'wxt/browser';
import type { BrowserTab, PageAccessError, TabsPort } from '@/application/ports';
import { err, ok } from '@/shared/result';
import { readSelectedText } from './read-selected-text';

/**
 * Tab access through `tabs.query` and `scripting.executeScript`. Neither needs host
 * permissions: the `activeTab` permission gives temporary access to the tab the user
 * acted on (toolbar button, context menu, or keyboard shortcut).
 */
export function createBrowserTabs(): TabsPort {
  const api = browser as Partial<typeof browser>;

  return {
    getActiveTab: async () => {
      if (!api.tabs) return err(TABS_UNAVAILABLE);
      try {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });
        if (tab?.id === undefined || tab.id < 0) return err(NO_TAB);
        return ok<BrowserTab>({ id: tab.id, url: tab.url, title: tab.title });
      } catch (error) {
        console.warn('[Recall] Could not read the active tab:', error);
        return err(NO_TAB);
      }
    },

    readSelection: async (tabId, frameId) => {
      if (!api.scripting) return err(SCRIPTING_UNAVAILABLE);
      try {
        const [frame] = await api.scripting.executeScript({
          target: frameId === undefined ? { tabId } : { tabId, frameIds: [frameId] },
          func: readSelectedText,
        });
        const reading = frame?.result;
        // No result means the frame went away or the script could not run.
        if (!reading) return err(PAGE_BLOCKED);
        if (reading.kind === 'password') return err(PASSWORD_FIELD);
        if (reading.kind === 'unreadable') return err(PAGE_BLOCKED);
        return ok(reading.text);
      } catch (error) {
        // Browsers refuse to run scripts in protected pages: their own pages, add-on
        // stores, built-in PDF viewers, and pages the user has not acted on.
        console.warn('[Recall] Could not read the selection:', error);
        return err(PAGE_BLOCKED);
      }
    },
  };
}

const TABS_UNAVAILABLE: PageAccessError = {
  kind: 'unavailable',
  message: 'Recall cannot see your tabs here. Open Recall from the toolbar button.',
};

const NO_TAB: PageAccessError = {
  kind: 'no_tab',
  message: 'Recall could not find the current tab. Click a page and try again.',
};

const SCRIPTING_UNAVAILABLE: PageAccessError = {
  kind: 'unavailable',
  message: 'Recall cannot read selected text in this browser.',
};

const PASSWORD_FIELD: PageAccessError = {
  kind: 'sensitive',
  message: 'Recall never saves text from password fields.',
};

const PAGE_BLOCKED: PageAccessError = {
  kind: 'blocked',
  message:
    'Recall cannot read the selected text on this page (PDF viewers and add-on stores, for example). Try right-clicking the selection and choosing "Save selection to Recall".',
};
