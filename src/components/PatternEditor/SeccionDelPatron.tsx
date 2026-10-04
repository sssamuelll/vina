import { Fragment, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setDefaultSAWidth } from '../../store/editorSlice';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools/types';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from '../shell/shortcutDisplay';
import { herramientaParaMostrar } from '../shell/herramientaParaMostrar';
import { Control } from './ToolOptionControls';
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

  return (
    <div ref={raiz} className="seccion-del-patron" role="group" aria-label="Herramienta activa" data-shortcut-context="2d">
      <span className="seccion-del-patron__quien">
        {Icono && <Icono size={16} />}
        <span className="seccion-del-patron__nombre">{nombre}</span>
        {atajo && <kbd className="seccion-del-patron__tecla">{atajo}</kbd>}
      </span>
      {controles.length > 0 && (
        <div className="seccion-del-patron__opciones" data-superficie="pie">
          {controles.map((c) => <Fragment key={c.clave}>{c.nodo}</Fragment>)}
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
    </div>
  );
}
