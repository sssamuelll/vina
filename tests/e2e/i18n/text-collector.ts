import type { Page } from '@playwright/test';

/**
 * The visible text of the page: every text node and every aria-label, title,
 * placeholder and alt. The output format is the Task 1 baseline's.
 *
 * Visibility is judged on the parent element only (it has client rects and is
 * not `visibility: hidden`), so text under `opacity: 0` or off-screen counts as
 * visible. That is how the baseline was taken; it changes only together with it.
 */
export function collectText(page: Page): Promise<{ text: string[]; attrs: string[] }> {
  // Self-contained on purpose: no closures over module scope.
  return page.evaluate(() => {
    const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    const inDev = (el: Element) => Boolean(el.closest('[data-superficie="dev"]'));
    const text = new Set<string>(), attrs = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const value = (n.nodeValue ?? '').trim();
      const parent = n.parentElement;
      if (value && parent && !inDev(parent) && visible(parent)) text.add(value);
    }
    for (const el of document.body.querySelectorAll('[aria-label],[title],[placeholder],[alt]')) {
      if (inDev(el) || !visible(el)) continue;
      for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
        const value = el.getAttribute(name)?.trim();
        if (value) attrs.add(value);
      }
    }
    return { text: [...text].sort(), attrs: [...attrs].sort() };
  });
}

/** The `data-superficie` values with a box inside the viewport, sorted. */
export function visibleSurfaces(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const visibles = new Set<string>();
    for (const el of document.querySelectorAll('[data-superficie]')) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      visibles.add(el.getAttribute('data-superficie') as string);
    }
    return [...visibles].sort();
  });
}
