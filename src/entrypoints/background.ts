import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';

// Chrome runs this as a service worker, Firefox as an event page. Both can be
// stopped when idle, so never keep important state in module-level variables.
export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    console.info(`[Recall] background ready (install reason: ${reason})`);
  });
});
