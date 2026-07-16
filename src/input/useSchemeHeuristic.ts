import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import { autoDetectTrackpad } from '../store/inputSchemeSlice';
import { showInfoToast } from '../store/copilotUISlice';

/**
 * One-shot passive trackpad detection (spec 2026-06-04 § Heurística).
 *
 * Signal: a wheel event with ctrlKey and no metaKey — Chrome/FF/Edge only
 * synthesize that for a trackpad pinch. Safari signals pinch via
 * `gesturestart` instead. Known accepted false positive: a mouse user
 * pressing Ctrl+wheel lands in Trackpad — recoverable via the toast, and
 * the reducer guard means an explicit choice (source==='user') is never
 * overridden. (tldraw lesson: auto-detect is a hint, never authority.)
 *
 * Once fired, `source` flips to 'auto' → this effect re-runs → early
 * return → listeners removed. Mounted once in AppShell.
 */
export function useSchemeHeuristic(): void {
  const dispatch = useDispatch<AppDispatch>();
  const source = useSelector((s: RootState) => s.inputScheme.source);

  useEffect(() => {
    if (source !== 'default') return;
    let fired = false; // sync one-shot: many wheel events can land before React re-runs this effect
    const fire = () => {
      if (fired) return;
      fired = true;
      dispatch(autoDetectTrackpad());
      dispatch(showInfoToast('Modo trackpad activado — cámbialo cuando quieras en Ajustes ▸ Entrada'));
    };
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey && !e.metaKey) fire();
    };
    const onGesture = () => fire();
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('gesturestart', onGesture);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('gesturestart', onGesture);
    };
  }, [source, dispatch]);
}
