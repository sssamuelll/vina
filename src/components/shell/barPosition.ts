/**
 * UnifiedBar floating-position helpers — persistence and viewport clamping.
 *
 * Kept outside UnifiedBar.tsx so the component file only exports components
 * (react-refresh) and so the restore→clamp contract is unit-testable.
 */

const STORAGE_KEY = 'openclo-bar-position';
export const BAR_WIDTH = 560;
export const BAR_HEIGHT = 58;

// Token max of --top-bar-h: clamp(36px, 2.5vw, 48px) — used when no .top-bar
// is mounted (e.g. hideChrome shells, tests).
const TOP_BAR_FALLBACK = 48;
const TOP_BAR_MARGIN = 8;

/** Bottom edge of the live top-bar, so the bar can roam the whole viewport
 *  except over it (decision 2026-06-04; previously confined to bottom 20%). */
function topBarBottom(): number {
  const el = document.querySelector('.top-bar');
  return (el ? el.getBoundingClientRect().bottom : TOP_BAR_FALLBACK) + TOP_BAR_MARGIN;
}

export function clampPosition(x: number, y: number): { x: number; y: number } {
  const minX = 16;
  const maxX = window.innerWidth - BAR_WIDTH - 16;
  const minY = topBarBottom();
  const maxY = window.innerHeight - BAR_HEIGHT - 16;
  return {
    x: Math.max(minX, Math.min(maxX, x)),
    y: Math.max(minY, Math.min(maxY, y)),
  };
}

/**
 * Load saved position or default to bottom-center. ALWAYS clamps the restored
 * value: a position saved on a bigger window would otherwise restore fully
 * outside the current viewport with no resize event to rescue it (bug
 * 2026-06-04 — the resize handler clamps live changes, but not the load).
 */
export function loadPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { x?: unknown; y?: unknown };
      if (typeof p.x === 'number' && Number.isFinite(p.x) && typeof p.y === 'number' && Number.isFinite(p.y)) {
        return clampPosition(p.x, p.y);
      }
    }
  } catch { /* ignore */ }
  return {
    x: Math.round((window.innerWidth - BAR_WIDTH) / 2),
    y: window.innerHeight - BAR_HEIGHT - 24,
  };
}

export function savePosition(p: { x: number; y: number }): void {
  // LS-only justified: window-geometry preference, device-local by nature —
  // same class as dockSlice layout state (B6 § LS-only exceptions).
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
