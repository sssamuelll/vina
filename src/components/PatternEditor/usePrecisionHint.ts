import { useCallback, useEffect, useRef, useState } from 'react';
import { storageGet, storageSet } from '../../utils/storage';

const STORAGE_KEY = 'precision-hint-used';

export function usePrecisionHint(): {
  showPrecisionHint: boolean;
  markPrecisionUsed: () => void;
} {
  const [showPrecisionHint, setShowPrecisionHint] = useState(true);
  const usedRef = useRef(false);
  const persistedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void storageGet('settings', STORAGE_KEY)
      .then((stored) => {
        if (!active || stored !== true) return;
        usedRef.current = true;
        persistedRef.current = true;
        setShowPrecisionHint(false);
      })
      .catch(() => {
        // La pista es ayuda degradable: si IDB falla, sigue visible.
      });
    return () => { active = false; };
  }, []);

  const markPrecisionUsed = useCallback(() => {
    if (usedRef.current) return;
    usedRef.current = true;
    setShowPrecisionHint(false);
    if (persistedRef.current) return;
    persistedRef.current = true;
    // shape: boolean v1 — opt-in envelope: no
    void storageSet('settings', STORAGE_KEY, true).catch(() => {
      // La sesión ya conoce el uso aunque IDB no esté disponible.
    });
  }, []);

  return { showPrecisionHint, markPrecisionUsed };
}
