import { waitUntil, type ContextMenu, type DesktopControls, type WebPage } from './types';
import type { ScreenWindow, VirtualDisplay } from './virtual-display';

/** Real input on `display`. `icon` is PageNest's 16-pixel icon, used to find its menu items. */
export function desktopControls(display: VirtualDisplay, icon: string): DesktopControls {
  const click = async (page: WebPage, selector: string, button?: 'left' | 'right') => {
    await page.bringToFront();
    await display.click(await page.evaluate(screenCenterOf, selector), button);
  };
  return {
    pressKeys: display.pressKeys,
    click,
    clickAt: display.click,
    screenshot: display.screenshot,
    findIcon: (box) =>
      display.find(icon, box ?? { left: 0, top: 0, right: display.width, bottom: display.height }),
    openContextMenu: async (open): Promise<ContextMenu> => {
      const before = new Set((await display.windows()).map((window) => window.id));
      await open();
      let menu: ScreenWindow | undefined;
      await waitUntil(async () => {
        menu = (await display.windows()).find(
          (window) => window.overrideRedirect && !before.has(window.id),
        );
        return menu !== undefined;
      });
      if (!menu) throw new Error('No context menu opened');
      const box = {
        left: menu.x,
        top: menu.y,
        right: menu.x + menu.width,
        bottom: menu.y + menu.height,
      };
      // The menu may still be drawing: read its items once two looks agree.
      let items = await display.find(icon, box);
      await waitUntil(async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const again = await display.find(icon, box);
        const settled = JSON.stringify(again) === JSON.stringify(items);
        items = again;
        return settled;
      });
      return { box, pageNestItems: items };
    },
  };
}

// Scrolls the element into view and returns its centre in screen pixels. Runs in the
// page. Firefox reports where the page starts on screen; in Chrome, everything above the
// page (tabs, toolbar, info bars) is the difference between the window and page heights.
function screenCenterOf(selector: string): { x: number; y: number } {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Nothing matches ${selector}`);
  element.scrollIntoView({ block: 'center', behavior: 'instant' });
  const box = element.getBoundingClientRect();
  const firefox = window as Window & { mozInnerScreenX?: number; mozInnerScreenY?: number };
  const left =
    firefox.mozInnerScreenX ?? window.screenX + (window.outerWidth - window.innerWidth) / 2;
  const top = firefox.mozInnerScreenY ?? window.screenY + (window.outerHeight - window.innerHeight);
  return { x: left + box.left + box.width / 2, y: top + box.top + box.height / 2 };
}
