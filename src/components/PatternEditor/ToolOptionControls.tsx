import { useState } from 'react';
import type { ToolOption } from '../../tools/types';
import './ToolOptionControls.css';

/**
 * Los controles de una opción de herramienta, para la línea al pie (spec
 * 2026-10-02 «la interfaz en papel» § 5.3): botones, no listas. Todas las
 * alternativas a la vista y a un clic; una lista desplegable solo con más de
 * ocho. Un número es un campo con sus botones de menos y más. Cada control
 * conserva `id="opcion-<id>"`, que usan los e2e.
 *
 * Se pintan igual en la línea al pie, que es marco, que dentro del menú «Más»,
 * que es papel: sus colores salen de tokens que el ámbito de papel redefine
 * (ToolOptionControls.css).
 */

/** Hasta ocho alternativas van como botones; con más, lista (spec § 5.3). */
const MAX_BOTONES = 8;

function acotar(opcion: ToolOption, n: number): number {
  const conMinimo = opcion.min != null ? Math.max(opcion.min, n) : n;
  return opcion.max != null ? Math.min(opcion.max, conMinimo) : conMinimo;
}

/** Al paso de 0,1, 0,2 + 0,1 no puede llegar al store como 0,30000000000000004. */
function redondearAlPaso(n: number, paso: number): number {
  const decimales = (String(paso).split('.')[1] ?? '').length;
  return Number(n.toFixed(decimales));
}

/**
 * Un número: un campo con borrador local y sus botones de menos y más. El
 * borrador deja vaciar el campo y escribir «300» tecla a tecla sin que un
 * campo vacío llegue al store como 0; lo que llega va acotado al rango
 * declarado, y al salir del campo se vuelve a leer el valor guardado. Los
 * botones de paso no entran en el orden del teclado: con el foco en el campo,
 * las flechas hacen lo mismo.
 */
function Numero({ id, opcion, valor, alCambiar }: {
  id: string;
  opcion: ToolOption;
  valor: number;
  alCambiar: (v: unknown) => void;
}) {
  const [borrador, setBorrador] = useState<string | null>(null);
  const paso = opcion.step ?? 1;
  // Los botones de paso no le quitan el foco al campo (la línea al pie no se
  // queda con el foco por un clic), así que el borrador se suelta aquí.
  const dar = (n: number) => {
    setBorrador(null);
    alCambiar(acotar(opcion, redondearAlPaso(n, paso)));
  };
  return (
    <span className="opcion-del-pie__numero">
      <button
        type="button"
        className="opcion-del-pie__paso"
        aria-label="Restar"
        tabIndex={-1}
        disabled={opcion.min != null && valor <= opcion.min}
        onClick={() => dar(valor - paso)}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        className="opcion-del-pie__campo"
        min={opcion.min}
        max={opcion.max}
        step={paso}
        value={borrador ?? String(valor)}
        onChange={(e) => {
          const texto = e.target.value;
          setBorrador(texto);
          if (texto === '' || Number.isNaN(Number(texto))) return;
          alCambiar(acotar(opcion, Number(texto)));
        }}
        onBlur={() => setBorrador(null)}
      />
      <button
        type="button"
        className="opcion-del-pie__paso"
        aria-label="Sumar"
        tabIndex={-1}
        disabled={opcion.max != null && valor >= opcion.max}
        onClick={() => dar(valor + paso)}
      >
        +
      </button>
    </span>
  );
}

/** Las alternativas, una por botón; con su dibujo si la opción lo trae. */
function Botones({ id, opcion, valor, alCambiar }: {
  id: string;
  opcion: ToolOption;
  valor: unknown;
  alCambiar: (v: unknown) => void;
}) {
  return (
    <span id={id} className="opcion-del-pie__botones" role="group" aria-labelledby={`${id}-rotulo`}>
      {(opcion.choices ?? []).map((c) => {
        const Dibujo = c.icon;
        // String() a los dos lados: la lista de antes guardaba la cantidad como "2".
        const activo = String(c.value) === String(valor);
        return (
          <button
            key={String(c.value)}
            type="button"
            className={`opcion-del-pie__boton${activo ? ' opcion-del-pie__boton--activo' : ''}`}
            aria-pressed={activo}
            aria-label={Dibujo ? c.label : undefined}
            title={Dibujo ? c.label : undefined}
            onClick={() => alCambiar(c.value)}
          >
            {Dibujo ? <Dibujo size={16} /> : c.label}
          </button>
        );
      })}
    </span>
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
      return (
        <div className="opcion-del-pie">
          <label className="opcion-del-pie__rotulo" htmlFor={id}>{opcion.label}</label>
          <Numero id={id} opcion={opcion} valor={Number(valor)} alCambiar={alCambiar} />
        </div>
      );

    case 'select': {
      const choices = opcion.choices ?? [];
      if (choices.length > MAX_BOTONES) {
        return (
          <div className="opcion-del-pie">
            <label className="opcion-del-pie__rotulo" htmlFor={id}>{opcion.label}</label>
            <select
              id={id}
              className="opcion-del-pie__lista"
              value={String(valor)}
              onChange={(e) => alCambiar(choices.find((c) => String(c.value) === e.target.value)?.value ?? e.target.value)}
            >
              {choices.map((c) => (
                <option key={String(c.value)} value={String(c.value)}>{c.label}</option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div className="opcion-del-pie">
          <span id={`${id}-rotulo`} className="opcion-del-pie__rotulo">{opcion.label}</span>
          <Botones id={id} opcion={opcion} valor={valor} alCambiar={alCambiar} />
        </div>
      );
    }

    case 'toggle':
      // Sin texto encendido/apagado: el estado va en la marca y en
      // aria-pressed. Por ley de estado no puede depender solo del tono.
      return (
        <div className="opcion-del-pie">
          <button
            id={id}
            type="button"
            className={`opcion-del-pie__interruptor${valor ? ' opcion-del-pie__interruptor--activo' : ''}`}
            aria-pressed={Boolean(valor)}
            onClick={() => alCambiar(!valor)}
          >
            <span className="opcion-del-pie__marca" aria-hidden="true" />
            {opcion.label}
          </button>
        </div>
      );

    case 'color':
      return (
        <div className="opcion-del-pie">
          <label className="opcion-del-pie__rotulo" htmlFor={id}>{opcion.label}</label>
          <input id={id} type="color" className="opcion-del-pie__color" value={String(valor)} onChange={(e) => alCambiar(e.target.value)} />
        </div>
      );

    default:
      return null;
  }
}
