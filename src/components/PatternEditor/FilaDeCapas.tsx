import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { ChevronDown } from 'lucide-react';
import type { AppDispatch, RootState } from '../../store';
import {
  toggleGrainlines,
  toggleNotches,
  toggleSeamAllowance,
  toggleSewingLines,
  toggleTrazos,
  setLineLengthMode,
} from '../../store/editorSlice';
import { pushJournal } from '../../utils/telemetry/journal';

const CAPAS = [
  { kind: 'toggle', label: 'Margen', flag: 'showSeamAllowance', action: toggleSeamAllowance },
  { kind: 'toggle', label: 'Hilo', flag: 'showGrainlines', action: toggleGrainlines },
  { kind: 'toggle', label: 'Piquetes', flag: 'showNotches', action: toggleNotches },
  { kind: 'toggle', label: 'Costuras', flag: 'showSewingLines', action: toggleSewingLines },
  // Firma de María 2026-09-12: interruptor de dos estados, no un desplegable
  // de tres. Casilla como sus hermanas, no un caso especial de verdad — solo
  // lee/escribe un campo que no es booleano (lineLengthMode).
  { kind: 'largos', label: 'Largos' },
  { kind: 'toggle', label: 'Construcción', flag: 'showTrazos', action: toggleTrazos },
] as const;

/** El nombre del grupo, plegado o no: el lector de pantalla oye lo mismo. */
const NOMBRE = 'Qué se ve del patrón';

const selectCapasVisibles = (state: RootState) => ({
  showSeamAllowance: state.editor.showSeamAllowance,
  showGrainlines: state.editor.showGrainlines,
  showNotches: state.editor.showNotches,
  showSewingLines: state.editor.showSewingLines,
  lineLengthMode: state.editor.lineLengthMode,
  showTrazos: state.editor.showTrazos,
});

/**
 * ¿Caben los seis en su hueco? Se decide midiendo (spec 2026-10-02 § 4.2), no
 * con un ancho escrito: en otro idioma los rótulos miden otra cosa. Desplegado,
 * `scrollWidth` de la fila es su ancho natural y se guarda; plegado ya no se
 * puede medir, así que se compara el hueco con el último ancho natural. Sin
 * `ResizeObserver` (jsdom) nunca se pliega.
 */
function useNoCabe(hueco: RefObject<HTMLDivElement>): boolean {
  const [noCabe, setNoCabe] = useState(false);
  const anchoNatural = useRef(0);
  useLayoutEffect(() => {
    const el = hueco.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let anotado: boolean | undefined;
    const medir = () => {
      const fila = el.querySelector<HTMLElement>('.grupo-del-patron__fila');
      if (fila) anchoNatural.current = fila.scrollWidth;
      const plegado = anchoNatural.current > el.clientWidth;
      // La caja negra ve si se plegó y con qué anchos: un «no encuentro Largos»
      // en la máquina de María se lee ahí, no se adivina.
      if (plegado !== anotado) {
        anotado = plegado;
        pushJournal('ui', 'grupo-del-patron', { plegado, hueco: el.clientWidth, natural: anchoNatural.current });
      }
      setNoCabe(plegado);
    };
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    medir();
    // Con la fuente de verdad cargada los rótulos cambian de ancho, y el hueco
    // no: el observador no se enteraría.
    void document.fonts?.ready.then(medir);
    return () => ro.disconnect();
  }, [hueco]);
  return noCabe;
}

/**
 * El grupo del patrón (spec 2026-10-02 «la interfaz en papel» § 4.2): los seis
 * interruptores de lo que se ve, en la barra superior, entre rehacer y el
 * selector de vista. Hasta P2 eran una fila flotante sobre el lienzo (#1109).
 *
 * Cuando no caben (otro idioma, una ventana más estrecha) se pliegan en un solo
 * botón, «Mostrar», con los seis dentro. En español a 1366 px no se pliega: lo
 * fija `barra-superior.spec.ts`.
 */
export default function FilaDeCapas() {
  const dispatch = useDispatch<AppDispatch>();
  const visibles = useSelector(selectCapasVisibles, shallowEqual);
  const hueco = useRef<HTMLDivElement>(null);
  const noCabe = useNoCabe(hueco);
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, top: 0 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Si la ventana crece con el menú abierto, el menú se va con el botón.
  useEffect(() => { if (!noCabe) setAbierto(false); }, [noCabe]);

  // Abrir y cerrar quedan en la bitácora, venga de un clic, de Escape o de que
  // vuelvan a caber. Abierto, el foco entra al menú: cuelga de <body>, y Tab
  // desde «Mostrar» no llegaría a los seis (igual que el personalizador).
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'mostrar', { abierto });
    if (abierto) menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (botonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menuRef.current?.contains(document.activeElement)) botonRef.current?.focus();
      setAbierto(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [abierto]);

  const interruptores = CAPAS.map((capa) => {
    const activo = capa.kind === 'largos' ? visibles.lineLengthMode === 'all' : visibles[capa.flag];
    const handleClick = () => {
      if (capa.kind === 'largos') dispatch(setLineLengthMode(activo ? 'none' : 'all'));
      else dispatch(capa.action());
    };
    return (
      <button
        key={capa.label}
        type="button"
        className={`grupo-del-patron__interruptor${activo ? ' grupo-del-patron__interruptor--activo' : ''}`}
        aria-pressed={activo}
        onClick={handleClick}
      >
        <span className="grupo-del-patron__marca" aria-hidden="true" />
        {capa.label}
      </button>
    );
  });

  return (
    <div ref={hueco} className="grupo-del-patron">
      {noCabe ? (
        <>
          <button
            ref={botonRef}
            type="button"
            className="grupo-del-patron__plegado"
            aria-expanded={abierto}
            aria-controls="grupo-del-patron-menu"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAncla({ left: r.left, top: r.bottom + 4 });
              setAbierto((a) => !a);
            }}
          >
            Mostrar
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          {abierto && createPortal(
            <div
              ref={menuRef}
              id="grupo-del-patron-menu"
              className="grupo-del-patron__menu"
              role="group"
              aria-label={NOMBRE}
              data-superficie="menu"
              data-material="papel"
              style={{ left: ancla.left, top: ancla.top }}
            >
              {interruptores}
            </div>,
            document.body,
          )}
        </>
      ) : (
        <div className="grupo-del-patron__fila" role="group" aria-label={NOMBRE}>
          {interruptores}
        </div>
      )}
    </div>
  );
}
