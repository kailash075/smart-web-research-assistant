import { browser, type Browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import type { AppError } from '@/application/errors';
import type { BrowserTab } from '@/application/ports';
import {
  savePageFromTab,
  saveSelectionFromTab,
  type SelectionSource,
} from '@/application/save-from-tab';
import type { SaveOutcome } from '@/application/save-item';
import { createAppServices, type AppServices } from '@/composition/app-services';
import type { Result } from '@/shared/result';
import { showSaveFeedback } from './feedback';

const MENU_SAVE_PAGE = 'save-page';
const MENU_SAVE_SELECTION = 'save-selection';
const COMMAND_SAVE_PAGE = 'save-page';
const COMMAND_SAVE_SELECTION = 'save-selection';

// Chrome runs this as a service worker, Firefox as an event page. Both can be
// stopped when idle, so never keep important state in module-level variables, and
// register every listener synchronously so a stopped background wakes up for it.
export default defineBackground(() => {
  const services = createAppServices();

  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`[PageNest] background ready (install reason: ${reason})`);
    void createContextMenus();
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      const target = toBrowserTab(tab, info.pageUrl) ?? (await pdfViewerTab(services, info, tab));
      if (!target) return;
      await runSave(
        target,
        info.menuItemId === MENU_SAVE_SELECTION
          ? saveSelectionFromTab(services, target, {}, selectionSource(info))
          : savePageFromTab(services, target),
      );
    })();
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== COMMAND_SAVE_PAGE && command !== COMMAND_SAVE_SELECTION) return;
    void (async () => {
      const target = toBrowserTab(tab) ?? (await activeTab(services));
      if (!target) return;
      await runSave(
        target,
        command === COMMAND_SAVE_PAGE
          ? savePageFromTab(services, target)
          : saveSelectionFromTab(services, target),
      );
    })();
  });
});

async function createContextMenus(): Promise<void> {
  // Menus survive background restarts but not every update, so start from scratch.
  await browser.contextMenus.removeAll();
  // Only offered on web pages, the only pages PageNest can save.
  const documentUrlPatterns = ['http://*/*', 'https://*/*'];
  browser.contextMenus.create({
    id: MENU_SAVE_PAGE,
    title: 'Save page to PageNest',
    contexts: ['page'],
    documentUrlPatterns,
  });
  browser.contextMenus.create({
    id: MENU_SAVE_SELECTION,
    title: 'Save selection to PageNest',
    contexts: ['selection'],
    documentUrlPatterns,
  });
}

async function runSave(
  tab: BrowserTab,
  save: Promise<Result<SaveOutcome, AppError>>,
): Promise<void> {
  try {
    await showSaveFeedback(tab.id, await save);
  } catch (error) {
    console.error('[PageNest] Saving failed unexpectedly:', error);
  }
}

function toBrowserTab(tab: Browser.tabs.Tab | undefined, pageUrl?: string): BrowserTab | undefined {
  if (tab?.id === undefined || tab.id < 0) return undefined;
  return { id: tab.id, url: tab.url ?? pageUrl, title: tab.title };
}

async function activeTab(services: AppServices): Promise<BrowserTab | undefined> {
  const result = await services.tabs.getActiveTab();
  return result.ok ? result.value : undefined;
}

// In older Chrome versions (Chrome 120 does this, Chrome 153 does not), a click in the
// PDF viewer reports the viewer instead of the tab: no tab ID, and the viewer's own
// address. The PDF's address is the clicked frame's, and its tab is the active one.
async function pdfViewerTab(
  services: AppServices,
  info: Browser.contextMenus.OnClickData,
  tab: Browser.tabs.Tab | undefined,
): Promise<BrowserTab | undefined> {
  if (info.frameUrl === undefined) return undefined;
  const active = await activeTab(services);
  if (!active) return undefined;
  return { id: active.id, url: info.frameUrl, title: tab?.title ?? active.title };
}

function selectionSource(info: Browser.contextMenus.OnClickData): SelectionSource {
  return {
    ...(info.frameId !== undefined && { frameId: info.frameId }),
    ...(info.selectionText !== undefined && { fallbackText: info.selectionText }),
  };
}
