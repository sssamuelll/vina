import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { ChevronUp } from 'lucide-react';
import type { RootState } from '../../store';
import { setDefaultSAWidth } from '../../store/editorSlice';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools/types';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from '../shell/shortcutDisplay';
import { herramientaParaMostrar } from '../shell/herramientaParaMostrar';
import { pushJournal } from '../../utils/telemetry/journal';
import { Control } from './ToolOptionControls';
import { cuantasCaben } from './cuantasCaben';
import type { FraseDelPie } from './fraseDeLaFase';
import './SeccionDelPatron.css';

/** Referencia estable: un `?? {}` dentro del selector re-renderiza en bucle. */
const SIN_VALORES: Record<string, unknown> = {};

/**
 * Opciones que no van al pie porque su puerta son las cotas sobre la pieza
 * (spec 2026-08-30 § 6): Ancho y Alto del rectángulo siguen en `toolSlice`
 * como el tamaño del próximo clic, y la frase lo dice.
 */
const OCULTAS: Record<string, ReadonlySet<string>> = {
  rectangle: new Set(['width', 'height']),
};

/**
 * «Margen del próximo clic» no es una opción del registro: escribe
 * `editor.defaultSeamAllowanceWidth`, que el reducer acota a [0, 50].
 */
const MARGEN_DEL_PROXIMO_CLIC: ToolOption = {
  id: 'margenDelProximoClic',
  label: 'Margen del próximo clic (mm)',
  type: 'number',
  value: 10,
  min: 0,
  max: 50,
  step: 0.5,
};

/** Las tres que dejan mediciones: su borrado tiene puerta aquí, junto a sus mandos (Medir, D3). */
const DEJAN_MEDICIONES = new Set(['measure', 'measureCurve', 'compareCurves']);

/** Lo que la frase conserva antes de que las opciones se plieguen en «Más» (spec § 5.3). */
const FRASE_MIN_PX = 200;
/** Lo que se reserva para «Más» al decidir cuántas caben. */
const ANCHO_MAS_PX = 64;

/**
 * ¿Cuántas opciones caben a la vista? Se decide midiendo, como el plegado de la
 * barra superior: con todas a la vista se mide cada una y se guarda; plegadas
 * ya no se pueden medir, así que se decide con lo guardado. Una herramienta
 * nueva, o la fuente de verdad recién cargada, se vuelven a medir con todas a
 * la vista: el efecto de diseño corre antes de pintar, así que ese paso no
 * llega a verse. Sin `ResizeObserver` (jsdom) caben todas.
 */
function useCuantasCaben(raiz: RefObject<HTMLDivElement>, herramienta: string, total: number): number {
  const [medida, setMedida] = useState({ herramienta, cuantas: total });
  const anchos = useRef<{ herramienta: string; lista: number[] } | null>(null);
  const anotado = useRef('');
  const cuantas = medida.herramienta === herramienta ? Math.min(medida.cuantas, total) : total;

  const medir = useCallback(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fila = el.querySelector<HTMLElement>('.seccion-del-patron__opciones');
    const quien = el.querySelector<HTMLElement>('.seccion-del-patron__quien');
    if (!fila || !quien) return;
    const controles = Array.from(fila.children).filter(
      (h): h is HTMLElement => h instanceof HTMLElement && h.classList.contains('opcion-del-pie'),
    );
    if (controles.length === total) anchos.current = { herramienta, lista: controles.map((c) => c.offsetWidth) };
    if (!anchos.current || anchos.current.herramienta !== herramienta || anchos.current.lista.length !== total) return;
    const css = getComputedStyle(el);
    const hueco = el.clientWidth - (parseFloat(css.paddingLeft) || 0) - (parseFloat(css.paddingRight) || 0)
      - quien.offsetWidth - 2 * (parseFloat(css.columnGap) || 0) - FRASE_MIN_PX;
    const k = cuantasCaben(anchos.current.lista, hueco, parseFloat(getComputedStyle(fila).columnGap) || 0, ANCHO_MAS_PX);
    // La caja negra ve cuántas quedaron a la vista y con qué hueco: un «no
    // encuentro el ancho» en la máquina de María se lee ahí.
    const clave = `${herramienta}:${k}`;
    if (anotado.current !== clave) {
      anotado.current = clave;
      pushJournal('ui', 'linea-al-pie', { herramienta, aLaVista: k, total, hueco: Math.round(hueco) });
    }
    setMedida((m) => (m.herramienta === herramienta && m.cuantas === k ? m : { herramienta, cuantas: k }));
  }, [raiz, herramienta, total]);

  useLayoutEffect(() => { medir(); }, [medir, cuantas]);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(el);
    return () => ro.disconnect();
  }, [raiz, medir]);

  // Con la fuente de verdad cargada los rótulos cambian de ancho y la franja
  // no: el observador no se enteraría. Se vuelve a medir con todas a la vista.
  useEffect(() => {
    let vivo = true;
    void document.fonts?.ready.then(() => {
      if (!vivo) return;
      anchos.current = null;
      setMedida((m) => ({ ...m, cuantas: Number.POSITIVE_INFINITY }));
    });
    return () => { vivo = false; };
  }, []);

  return cuantas;
}

/**
 * La sección del patrón de la línea al pie (spec 2026-10-02 «la interfaz en
 * papel» § 5.3 y § 5.4): quién (el icono, el nombre y la tecla de la
 * herramienta activa), sus opciones como botones, y la frase. Sustituye a la
 * tarjeta de la esquina (`ToolStrip2D`, § 8). `PatternEditor` la pinta por
 * portal en la ranura de la línea al pie, porque la frase sale del estado de
 * sus herramientas.
 *
 * Es contexto 2D de los atajos: con el foco en un botón de aquí, las teclas
 * siguen siendo las del patrón, como cuando la tarjeta vivía dentro de la hoja.
 */
export default function SeccionDelPatron({
  frase,
  inerte = false,
  onClearMeasurements,
  hasMeasurements = false,
}: {
  frase: FraseDelPie | null;
  /** Hay un modal encima (el del piquete, hasta P3): la sección no recibe el foco (#1125). */
  inerte?: boolean;
  onClearMeasurements?: () => void;
  hasMeasurements?: boolean;
}) {
  const dispatch = useDispatch();
  const raiz = useRef<HTMLDivElement>(null);
  const registroDeAtajos = useShortcutRegistry();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const margenDelProximoClic = useSelector((s: RootState) => s.editor.defaultSeamAllowanceWidth);
  const valores = useSelector((s: RootState) => s.tools.toolOptions[activeTool] ?? SIN_VALORES);

  // `inert` no existe en los tipos de React 18: se pone en el DOM a mano, en el
  // contenedor y no en cada control, para que no se olvide ninguno (#1125).
  useEffect(() => {
    raiz.current?.toggleAttribute('inert', inerte);
  }, [inerte]);

  const alCambiar = useCallback(
    (optionId: string, value: unknown) => dispatch(setToolOption({ toolId: activeTool, optionId, value })),
    [dispatch, activeTool],
  );

  const quien = herramientaParaMostrar(activeTool);
  const Icono = quien?.icon;
  const nombre = quien?.label ?? activeTool;
  // El atajo EFECTIVO, no el de fábrica: el registro guarda los de la usuaria.
  const combo = registroDeAtajos?.getBinding(`tool.${activeTool}`) ?? null;
  const atajo = combo ? displayShortcutBinding(combo) : null;

  const ocultas = OCULTAS[activeTool];
  const controles: Array<{ clave: string; nodo: ReactNode }> = (toolRegistry.getTool(activeTool)?.options ?? [])
    .filter((o) => !ocultas?.has(o.id))
    .map((o) => ({
      clave: o.id,
      nodo: <Control opcion={o} valor={valores[o.id] ?? o.value} alCambiar={(v) => alCambiar(o.id, v)} />,
    }));
  if (activeTool === 'seamAllowance') {
    controles.push({
      clave: MARGEN_DEL_PROXIMO_CLIC.id,
      nodo: (
        <Control
          opcion={MARGEN_DEL_PROXIMO_CLIC}
          valor={margenDelProximoClic}
          alCambiar={(v) => dispatch(setDefaultSAWidth(Number(v)))}
        />
      ),
    });
  }
  if (DEJAN_MEDICIONES.has(activeTool)) {
    controles.push({
      clave: 'borrarMediciones',
      nodo: (
        <div className="opcion-del-pie">
          <button
            type="button"
            className="opcion-del-pie__accion"
            onClick={onClearMeasurements}
            disabled={!hasMeasurements || !onClearMeasurements}
          >
            Borrar mediciones
          </button>
        </div>
      ),
    });
  }

  const cuantas = useCuantasCaben(raiz, activeTool, controles.length);
  const plegadas = controles.slice(cuantas);
  const [abierto, setAbierto] = useState(false);
  const [ancla, setAncla] = useState({ left: 0, bottom: 0 });
  const masRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Otra herramienta, un modal encima, o que vuelvan a caber todas: el menú se
  // cierra con su botón.
  useEffect(() => { setAbierto(false); }, [activeTool, inerte]);
  useEffect(() => { if (plegadas.length === 0) setAbierto(false); }, [plegadas.length]);

  // Abrir y cerrar quedan en la bitácora. Abierto, el foco entra al menú:
  // cuelga de <body>, y Tab desde «Más» no llegaría (como «Mostrar»).
  const abiertoAntes = useRef(abierto);
  useEffect(() => {
    if (abiertoAntes.current === abierto) return;
    abiertoAntes.current = abierto;
    pushJournal('ui', 'mas', { abierto, herramienta: activeTool });
    if (abierto) menuRef.current?.querySelector<HTMLElement>('button:not([tabindex="-1"]), input, select')?.focus();
  }, [abierto, activeTool]);

  useEffect(() => {
    if (!abierto) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (masRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setAbierto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menuRef.current?.contains(document.activeElement)) masRef.current?.focus();
      setAbierto(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [abierto]);

  return (
    <div ref={raiz} className="seccion-del-patron" role="group" aria-label="Herramienta activa" data-shortcut-context="2d">
      <span className="seccion-del-patron__quien">
        {Icono && <Icono size={16} />}
        <span className="seccion-del-patron__nombre">{nombre}</span>
        {atajo && <kbd className="seccion-del-patron__tecla">{atajo}</kbd>}
      </span>
      {controles.length > 0 && (
        <div className="seccion-del-patron__opciones" data-superficie="pie">
          {controles.slice(0, cuantas).map((c) => <Fragment key={c.clave}>{c.nodo}</Fragment>)}
          {plegadas.length > 0 && (
            <button
              ref={masRef}
              type="button"
              className="seccion-del-patron__mas"
              aria-expanded={abierto}
              aria-controls="seccion-del-patron-mas"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                // Hacia arriba, sobre la hoja: se apoya en el borde de arriba de
                // la línea al pie, no en el del botón, que la taparía.
                const arriba = e.currentTarget.closest('.linea-al-pie')?.getBoundingClientRect().top ?? r.top;
                setAncla({ left: r.left, bottom: window.innerHeight - arriba + 4 });
                setAbierto((a) => !a);
              }}
            >
              Más
              <ChevronUp size={12} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {/* La región viva va montada SIEMPRE y solo cambia su contenido: los
          lectores de pantalla anuncian cambios DENTRO de una región que ya
          existía (el precedente es ToastContainer.tsx). */}
      <div className="seccion-del-patron__frase" aria-live="polite">
        {frase && (
          <span
            className={`seccion-del-patron__texto seccion-del-patron__texto--${frase.tipo}`}
            data-superficie="pista"
            title={frase.texto}
          >
            {frase.texto}
          </span>
        )}
      </div>
      {abierto && plegadas.length > 0 && createPortal(
        <div
          ref={menuRef}
          id="seccion-del-patron-mas"
          className="seccion-del-patron__menu"
          role="group"
          aria-label={`Más opciones de ${nombre}`}
          data-superficie="menu"
          data-material="papel"
          data-shortcut-context="2d"
          style={{ left: ancla.left, bottom: ancla.bottom }}
        >
          {plegadas.map((c) => <Fragment key={c.clave}>{c.nodo}</Fragment>)}
        </div>,
        document.body,
      )}
    </div>
  );
}
