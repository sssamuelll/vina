import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setDefaultSAWidth } from '../../store/editorSlice';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from '../shell/shortcutDisplay';
import { Control } from './ToolOptionControls';
import './ToolStrip2D.css';

/** Referencia estable: un `?? {}` dentro del selector re-renderiza en bucle. */
const SIN_VALORES: Record<string, unknown> = {};

/**
 * Opciones que ya no se pintan en la tira porque su puerta son las cotas
 * sobre el objeto (spec 2026-08-30 § 6): Ancho/Alto del rectángulo siguen
 * en `toolSlice` como default del próximo clic, y la línea de sujeto los dice.
 */
const OCULTAS_EN_LA_TIRA: Record<string, ReadonlySet<string>> = {
  rectangle: new Set(['width', 'height']),
};

/**
 * La tira de herramienta (spec 2026-08-30 § 6): lo que no tiene sitio en el
 * lienzo — la herramienta y su atajo efectivo, qué se está editando, y los
 * defaults de la herramienta. Repone la puerta de la barra desmontada
 * (`ToolOptionsBar2D`, #1049) en la esquina del lienzo, donde el dock no la
 * tapa. Lee `editor.activeTool`, la autoridad de `PatternEditor`.
 */
export default function ToolStrip2D({ lineaDeSujeto }: { lineaDeSujeto: string | null }) {
  const dispatch = useDispatch();
  const registroDeAtajos = useShortcutRegistry();
  const activeTool = useSelector((s: RootState) => s.editor.activeTool);
  const defaultSeamAllowanceWidth = useSelector(
    (s: RootState) => s.editor.defaultSeamAllowanceWidth,
  );
  const valores = useSelector((s: RootState) => s.tools.toolOptions[activeTool] ?? SIN_VALORES);
  const [seamAllowanceValue, setSeamAllowanceValue] = useState(
    String(defaultSeamAllowanceWidth),
  );

  useEffect(() => {
    setSeamAllowanceValue(String(defaultSeamAllowanceWidth));
  }, [defaultSeamAllowanceWidth]);

  const definicion = toolRegistry.getTool(activeTool);
  const ocultas = OCULTAS_EN_LA_TIRA[activeTool];
  const opciones = (definicion?.options ?? []).filter((o) => !ocultas?.has(o.id));

  // El atajo EFECTIVO, no el predeterminado: ShortcutRegistry guarda las
  // sobrescrituras de la usuaria en localStorage.
  const combo = registroDeAtajos?.getBinding(`tool.${activeTool}`) ?? null;
  const atajo = combo ? displayShortcutBinding(combo) : null;

  const alCambiar = useCallback(
    (optionId: string, value: unknown) => {
      dispatch(setToolOption({ toolId: activeTool, optionId, value }));
    },
    [dispatch, activeTool],
  );

  const confirmarMargen = () => {
    const width = parseFloat(seamAllowanceValue);
    if (!Number.isFinite(width) || width < 0) {
      setSeamAllowanceValue(String(defaultSeamAllowanceWidth));
      return;
    }
    // El reducer recorta a [0,50]; recortamos aqui tambien para que el campo no
    // se quede enseñando un numero que el store ya rechazo (si el store no
    // cambia, el efecto de sincronizacion no vuelve a correr).
    const acotado = Math.min(width, 50);
    setSeamAllowanceValue(String(acotado));
    dispatch(setDefaultSAWidth(acotado));
  };

  return (
    <div className="tool-strip" role="group" aria-label="Herramienta activa">
      <div className="tool-strip__head">
        <span className="tool-strip__tool">{definicion?.name ?? activeTool}</span>
        {atajo && <kbd className="tool-strip__shortcut">{atajo}</kbd>}
      </div>
      {lineaDeSujeto && <div className="tool-strip__subject">{lineaDeSujeto}</div>}
      {activeTool === 'seamAllowance' && (
        <div className="tool-strip__options">
          <div className="tool-strip__item">
            <label className="tool-strip__label" htmlFor="seam-allowance-next-width">
              Margen del próximo clic
            </label>
            <span className="tool-strip__valor">
              <input
                id="seam-allowance-next-width"
                type="number"
                className="tool-strip__input"
                min={0}
                max={50}
                step={0.5}
                value={seamAllowanceValue}
                onChange={(event) => setSeamAllowanceValue(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') confirmarMargen(); }}
                onBlur={confirmarMargen}
              />{' '}
              mm
            </span>
          </div>
        </div>
      )}
      {opciones.length > 0 && (
        <div className="tool-strip__options">
          {opciones.map((opcion) => (
            <Control
              key={opcion.id}
              opcion={opcion}
              valor={valores[opcion.id] ?? opcion.value}
              alCambiar={(v) => alCambiar(opcion.id, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
