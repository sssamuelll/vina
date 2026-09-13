import { useCallback, useEffect, useRef, useState } from 'react';
import { storageGet, storageSet } from '../../utils/storage';

const STORAGE_KEY = 'precision-hint-used';

export function usePrecisionHint(): {
  showPrecisionHint: boolean;
  markPrecisionUsed: () => void;
} {
  // Nace APAGADA: un arranque en frío la pintaba un instante aunque IDB ya
  // supiera que la usuaria la había usado — se encendía por defecto y recién
  // se apagaba cuando `storageGet` resolvía. Solo se enciende cuando se
  // CONFIRMA que nunca se usó (o que IDB no contesta): ayuda degradable, no
  // parpadeo por defecto.
  const [showPrecisionHint, setShowPrecisionHint] = useState(false);
  const usedRef = useRef(false);
  const persistedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void storageGet('settings', STORAGE_KEY)
      .then((stored) => {
        if (!active) return;
        if (stored === true) {
          usedRef.current = true;
          persistedRef.current = true;
          return;
        }
        // Sin marca: no hay parpadeo que corregir porque nació apagada, pero
        // si `markPrecisionUsed` ya corrió mientras IDB contestaba (Tab antes
        // de que resuelva) no hay que reencenderla con una lectura vieja.
        if (!usedRef.current) setShowPrecisionHint(true);
      })
      .catch(() => {
        // La pista es ayuda degradable: si IDB falla, se enciende igual —
        // salvo que el uso ya la haya apagado mientras tanto.
        if (active && !usedRef.current) setShowPrecisionHint(true);
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
