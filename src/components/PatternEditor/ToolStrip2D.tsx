import { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
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
  const valores = useSelector((s: RootState) => s.tools.toolOptions[activeTool] ?? SIN_VALORES);

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

  return (
    <div className="tool-strip" role="group" aria-label="Herramienta activa">
      <div className="tool-strip__head">
        <span className="tool-strip__tool">{definicion?.name ?? activeTool}</span>
        {atajo && <kbd className="tool-strip__shortcut">{atajo}</kbd>}
      </div>
      {lineaDeSujeto && <div className="tool-strip__subject">{lineaDeSujeto}</div>}
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
