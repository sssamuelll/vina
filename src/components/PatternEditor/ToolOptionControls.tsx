import { useState } from 'react';
import type { ToolOption } from '../../tools/types';

/**
 * Los controles de un `ToolOption` (number / select / toggle / color), mudados
 * de `ToolOptionsBar2D` a la tira de herramienta (spec 2026-08-30 § 6) sin
 * cambiar su contrato: `id="opcion-<id>"` se conserva porque los e2e de
 * piquete y tijeras lo usan.
 */

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
      className="tool-strip__input"
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

export function Control({
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
          <div className="tool-strip__item">
            <label className="tool-strip__label" htmlFor={id}>
              {opcion.label}
            </label>
            <NumberInput id={id} opcion={opcion} valor={Number(valor)} alCambiar={alCambiar} />
          </div>
        );
      }
      return (
        <div className="tool-strip__item">
          <label className="tool-strip__label" htmlFor={id}>
            {opcion.label}
          </label>
          <input
            id={id}
            type="range"
            className="tool-strip__slider"
            min={opcion.min ?? 0}
            max={opcion.max ?? 100}
            step={opcion.step ?? 1}
            value={Number(valor)}
            onChange={(e) => alCambiar(Number(e.target.value))}
          />
          <span className="tool-strip__valor">{String(valor)}</span>
        </div>
      );

    case 'select':
      return (
        <div className="tool-strip__item">
          <label className="tool-strip__label" htmlFor={id}>
            {opcion.label}
          </label>
          <select
            id={id}
            className="tool-strip__select"
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
        <div className="tool-strip__item">
          <button
            id={id}
            type="button"
            className={`tool-strip__toggle${valor ? ' tool-strip__toggle--activo' : ''}`}
            aria-pressed={Boolean(valor)}
            onClick={() => alCambiar(!valor)}
          >
            <span className="tool-strip__marca" aria-hidden="true" />
            {opcion.label}
          </button>
        </div>
      );

    case 'color':
      return (
        <div className="tool-strip__item">
          <label className="tool-strip__label" htmlFor={id}>
            {opcion.label}
          </label>
          <input
            id={id}
            type="color"
            className="tool-strip__color"
            value={String(valor)}
            onChange={(e) => alCambiar(e.target.value)}
          />
        </div>
      );

    default:
      return null;
  }
}
