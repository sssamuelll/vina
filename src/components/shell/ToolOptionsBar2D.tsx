/**
 * ToolOptionsBar2D — la canaleta superior del lienzo 2D.
 *
 * Repone el componente borrado en f4c5e92c (#1049). Tres diferencias con aquel:
 * el canal es permanente (nunca `return null` — acoplado, desaparecer hace
 * saltar el patrón), muestra nombre y atajo cuando la herramienta no declara
 * opciones, y no lee `optionsPanelCollapsed` ni el modo experto, porque
 * ninguno de los dos tiene puerta en la app.
 */
import { useCallback, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../../store';
import { setToolOption } from '../../store/toolSlice';
import { toolRegistry } from '../../tools';
import type { ToolOption } from '../../tools/types';
import { useShortcutRegistry } from '../../shortcuts';
import { displayShortcutBinding } from './shortcutDisplay';
import './ToolOptionsBar2D.css';

/** Referencia estable. Un `?? {}` dentro del selector crea un objeto por
 *  render y react-redux vuelve a renderizar en bucle. */
const SIN_VALORES: Record<string, unknown> = {};

export default function ToolOptionsBar2D() {
  const dispatch = useDispatch();
  const registroDeAtajos = useShortcutRegistry();
  const herramientaActiva = useSelector((s: RootState) => s.tools.activeTool2D);
  const valores = useSelector(
    (s: RootState) => s.tools.toolOptions[herramientaActiva] ?? SIN_VALORES,
  );

  const definicion = toolRegistry.getTool(herramientaActiva);
  const opciones = definicion?.options ?? [];

  // El atajo EFECTIVO, no el predeterminado: ShortcutRegistry guarda las
  // sobrescrituras de la usuaria en localStorage.
  const combo = registroDeAtajos?.getBinding(`tool.${herramientaActiva}`) ?? null;
  const atajo = combo ? displayShortcutBinding(combo) : null;

  const alCambiar = useCallback(
    (optionId: string, value: unknown) => {
      dispatch(setToolOption({ toolId: herramientaActiva, optionId, value }));
    },
    [dispatch, herramientaActiva],
  );

  return (
    <div
      className="tool-options-bar"
      role="toolbar"
      aria-label="Opciones de la herramienta"
    >
      <span className="tool-options-bar__tool">
        {definicion?.name ?? herramientaActiva}
      </span>
      {atajo && <kbd className="tool-options-bar__shortcut">{atajo}</kbd>}
      {opciones.length > 0 && (
        <span className="tool-options-bar__sep" aria-hidden="true" />
      )}
      {opciones.map((opcion) => (
        <Control
          key={opcion.id}
          opcion={opcion}
          valor={valores[opcion.id] ?? opcion.value}
          alCambiar={(v) => alCambiar(opcion.id, v)}
        />
      ))}
    </div>
  );
}

/**
 * Campo numérico escrito (`control: 'input'`). Lleva un borrador local: la
 * usuaria tiene que poder vaciar el campo y escribir "300" tecla a tecla, y
 * un campo vaciado no es 0 — el store solo recibe números; al salir del
 * campo el borrador se suelta y vuelve a leerse el valor guardado.
 */
function NumberInput({
  id, opcion, valor, alCambiar,
}: {
  id: string;
  opcion: ToolOption;
  valor: number;
  alCambiar: (v: unknown) => void;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  return (
    <input
      id={id}
      type="number"
      className="tool-options-bar__input"
      min={opcion.min ?? 0}
      max={opcion.max ?? 100}
      step={opcion.step ?? 1}
      value={borrador ?? String(valor)}
      onChange={(e) => {
        const texto = e.target.value;
        setBorrador(texto);
        if (texto === '' || Number.isNaN(Number(texto))) return;
        alCambiar(Number(texto));
      }}
      onBlur={() => setBorrador(null)}
    />
  );
}

function Control({
  opcion,
  valor,
  alCambiar,
}: {
  opcion: ToolOption;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  const id = `opcion-${opcion.id}`;

  switch (opcion.type) {
    case 'number':
      if (opcion.control === 'input') {
        return (
          <div className="tool-options-bar__item">
            <label className="tool-options-bar__label" htmlFor={id}>
              {opcion.label}
            </label>
            <NumberInput id={id} opcion={opcion} valor={Number(valor)} alCambiar={alCambiar} />
          </div>
        );
      }
      return (
        <div className="tool-options-bar__item">
          <label className="tool-options-bar__label" htmlFor={id}>
            {opcion.label}
          </label>
          <input
            id={id}
            type="range"
            className="tool-options-bar__slider"
            min={opcion.min ?? 0}
            max={opcion.max ?? 100}
            step={opcion.step ?? 1}
            value={Number(valor)}
            onChange={(e) => alCambiar(Number(e.target.value))}
          />
          <span className="tool-options-bar__valor">{String(valor)}</span>
        </div>
      );

    case 'select':
      return (
        <div className="tool-options-bar__item">
          <label className="tool-options-bar__label" htmlFor={id}>
            {opcion.label}
          </label>
          <select
            id={id}
            className="tool-options-bar__select"
            value={String(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          >
            {opcion.choices?.map((c) => (
              <option key={String(c.value)} value={String(c.value)}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      );

    case 'toggle':
      // Sin texto ON/OFF: el estado va en el relleno y en aria-pressed. Por
      // ley de estado no puede depender solo del tono.
      return (
        <div className="tool-options-bar__item">
          <button
            id={id}
            type="button"
            className={`tool-options-bar__toggle${valor ? ' tool-options-bar__toggle--activo' : ''}`}
            aria-pressed={Boolean(valor)}
            onClick={() => alCambiar(!valor)}
          >
            <span className="tool-options-bar__marca" aria-hidden="true" />
            {opcion.label}
          </button>
        </div>
      );

    case 'color':
      return (
        <div className="tool-options-bar__item">
          <label className="tool-options-bar__label" htmlFor={id}>
            {opcion.label}
          </label>
          <input
            id={id}
            type="color"
            className="tool-options-bar__color"
            value={String(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          />
        </div>
      );

    default:
      return null;
  }
}
