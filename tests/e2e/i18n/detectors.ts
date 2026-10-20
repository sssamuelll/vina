/**
 * In-page detectors for the i18n browser specs. Each function is serialized with `fn.toString()`
 * and run inside the page, so it uses only its own body: every helper and constant is declared
 * inside it (hence the repetition) and nothing refers to module scope. The fixture spec
 * `tests/e2e/i18n-detectors.spec.ts` is the check that the compiled source serializes.
 */

/** Visible text, `aria-label`, `title`, `placeholder` and `alt` that still hold a letter once every `[...]` run is removed. */
export function findUnmarkedText(root: Element): string[] {
  const SKIP = 'script,style,noscript,template,[translate="no"],[data-i18n-skip],[data-superficie="dev"]';
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  const NUMERIC = /^[\d\s.,:;/+\-−×*%°·]*\d[\d\s.,:;/+\-−×*%°·]*(?:\s?(?:mm²|cm²|m²|mm|cm|m|in|px|pt|kg|g|ms|s|fps|hz|kb|mb|gb))?[\d\s.,:;/+\-−×*%°·]*$/i;
  const hidden = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (getComputedStyle(e).display === 'none') return true;
    }
    return getComputedStyle(el).visibility === 'hidden';
  };
  const unmarked = (text: string): boolean => {
    const t = text.trim();
    if (!t || NUMERIC.test(t)) return false;
    return /\p{L}/u.test(t.replace(/\[[^\]]*\]/g, ''));
  };
  const out: string[] = [];
  const check = (el: Element, text: string | null | undefined) => {
    if (text && unmarked(text) && !el.closest(SKIP) && !hidden(el)) out.push(text.trim());
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement) check(n.parentElement, n.nodeValue);
  }
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) for (const a of ATTRS) check(el, el.getAttribute(a));
  return out;
}

/** Elements whose text runs past a clipping ancestor (overflow hidden or clip), on either axis. */
export function findClippedText(root: Element): Array<{ text: string; selector: string; axis: 'x' | 'y' }> {
  const SKIP = 'script,style,noscript,template,[translate="no"],[data-i18n-skip],[data-superficie="dev"]';
  const TOL = 1;
  const clips = (v: string) => v === 'hidden' || v === 'clip';
  const hidden = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (getComputedStyle(e).display === 'none') return true;
    }
    return getComputedStyle(el).visibility === 'hidden';
  };
  // Tag names, ids, class names and :nth-of-type only: never text or translated attributes.
  const selectorOf = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) {
      const sup = e.getAttribute('data-superficie');
      if (sup !== null) { parts.unshift(`[data-superficie="${sup}"]`); break; }
      if (e.tagName === 'BODY' || e.tagName === 'HTML') { parts.unshift(e.tagName.toLowerCase()); break; }
      let s = e.tagName.toLowerCase();
      if (e.id) s += `#${e.id}`;
      for (const c of Array.from(e.classList)) s += `.${c}`;
      const same = e.parentElement ? Array.from(e.parentElement.children).filter((x) => x.tagName === e!.tagName) : [];
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(e) + 1})`;
      parts.unshift(s);
    }
    return parts.join(' > ');
  };
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out: Array<{ text: string; selector: string; axis: 'x' | 'y' }> = [];
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) {
    if (el.closest(SKIP) || hidden(el)) continue;
    const own = Array.from(el.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim());
    if (!own.length) continue;
    const range = document.createRange();
    range.setStartBefore(own[0]);
    range.setEndAfter(own[own.length - 1]);
    const r = range.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const text = norm(el.textContent ?? '');
    const full = [el.closest('[title]')?.getAttribute('title'), el.getAttribute('aria-label')];
    if (full.some((f) => f && norm(f).includes(text))) continue;
    const found = new Set<'x' | 'y'>();
    for (let a: Element | null = el; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const cx = clips(cs.overflowX);
      const cy = clips(cs.overflowY);
      if (!cx && !cy) continue;
      const isSvg = a instanceof SVGElement;
      if (!isSvg && cs.display === 'inline') continue;
      const b = a.getBoundingClientRect();
      const left = isSvg ? b.left : b.left + a.clientLeft;
      const top = isSvg ? b.top : b.top + a.clientTop;
      const right = isSvg ? b.right : left + a.clientWidth;
      const bottom = isSvg ? b.bottom : top + a.clientHeight;
      if (cx && (r.right > right + TOL || r.left < left - TOL)) found.add('x');
      if (cy && (r.bottom > bottom + TOL || r.top < top - TOL)) found.add('y');
      if (cy && a === el && !isSvg && a.scrollHeight > a.clientHeight + TOL) found.add('y');
    }
    const selector = selectorOf(el);
    for (const axis of found) out.push({ text, selector, axis });
  }
  return out;
}

/** Visible text and accessible attributes holding a period decimal such as "12.5 mm" (German writes "12,5 mm"). */
export function findPeriodDecimals(root: Element): string[] {
  const SKIP = 'script,style,noscript,template,[translate="no"],[data-i18n-skip],[data-superficie="dev"]';
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  const hidden = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      if (getComputedStyle(e).display === 'none') return true;
    }
    return getComputedStyle(el).visibility === 'hidden';
  };
  const out: string[] = [];
  const check = (el: Element, text: string | null | undefined) => {
    if (text && /\d\.\d/.test(text) && !el.closest(SKIP) && !hidden(el)) out.push(text.trim());
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement) check(n.parentElement, n.nodeValue);
  }
  const all = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of all) for (const a of ATTRS) check(el, el.getAttribute(a));
  return out;
}
