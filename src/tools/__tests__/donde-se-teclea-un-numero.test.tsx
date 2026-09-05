/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Control } from '../../components/PatternEditor/ToolOptionControls';
import { toolRegistry } from '../index';
import type { ToolOption } from '../types';

/**
 * «Todo lo que pide es control: saber cuánto» — línea 13 del informe del audio
 * de María.
 *
 * El informe adversarial contó CUATRO superficies para escribir un número y las
 * midió en L, porque unificar cuatro gramáticas es grande. El censo del
 * 2026-09-05 encontró que el dolor no está ahí: está en la quinta, la que no
 * existe. De las doce opciones en milímetros que el repo declara, ONCE son
 * deslizadores de paso fijo, y el mecanismo para teclear —`control: 'input'`,
 * escrito, probado y con su borrador local— lo usa exactamente UNA herramienta:
 * Rectángulo.
 *
 * Lo que eso significa en la pantalla de María:
 *
 *   Separación del pespunte   paso 0,5 → 7,3 mm es INALCANZABLE
 *   Distancia de desplazar    1 a 200 en ~100 px → cada píxel vale 2 mm
 *   Largo de la pinza         paso 5 → 102 mm es INALCANZABLE
 *
 * Unificar las cuatro gramáticas que ya existen no le da un solo número más.
 * Darle un campo donde teclear, sí. Este archivo fija las dos mitades:
 *
 *  1. Toda opción que ya se rotula «(mm)» se teclea. El rótulo trae la unidad,
 *     el min/max ya está declarado y el componente existe: no hace falta
 *     decidir nada, solo encenderlo.
 *  2. Y el agujero que eso abre: con deslizador el rango se cumplía por
 *     construcción; con campo, no. `NumberInput` no acotaba al confirmar, así
 *     que teclear 999 en un campo de máximo 200 mandaba 999 al store.
 */

/** Las opciones que se rotulan en milímetros, sacadas del registro vivo. */
function opcionesEnMilimetros(): Array<{ tool: string; opcion: ToolOption }> {
  const salida: Array<{ tool: string; opcion: ToolOption }> = [];
  for (const tool of toolRegistry.getAllTools()) {
    for (const opcion of tool.options ?? []) {
      if (opcion.type === 'number' && /\(mm\)/.test(opcion.label)) {
        salida.push({ tool: tool.id, opcion });
      }
    }
  }
  return salida;
}

describe('donde ya dice «(mm)», María puede teclear', () => {
  it('el censo no está ciego: hay al menos diez opciones rotuladas en milímetros', () => {
    // Sin esto, un refactor del registro dejaría el test de abajo pasando en
    // vacío y la deuda volvería sin que nadie se entere.
    expect(opcionesEnMilimetros().length).toBeGreaterThanOrEqual(10);
  });

  it('todas son campo escrito, no deslizador', () => {
    const deslizadores = opcionesEnMilimetros()
      .filter(({ opcion }) => opcion.control !== 'input')
      .map(({ tool, opcion }) => `${tool}.${opcion.id} «${opcion.label}» (paso ${opcion.step ?? 1})`);

    expect(
      deslizadores,
      'estas piden un número en milímetros y solo se pueden arrastrar',
    ).toEqual([]);
  });

  it('y conservan su rango declarado: encender el campo no borra el min/max', () => {
    for (const { tool, opcion } of opcionesEnMilimetros()) {
      expect(opcion.min, `${tool}.${opcion.id} perdió su mínimo`).toBeTypeOf('number');
      expect(opcion.max, `${tool}.${opcion.id} perdió su máximo`).toBeTypeOf('number');
      expect(opcion.max!, `${tool}.${opcion.id} tiene el rango al revés`).toBeGreaterThan(opcion.min!);
    }
  });
});

describe('un campo escrito respeta su rango — el agujero que abre lo de arriba', () => {
  // La limpieza no es automática en esta configuración: sin esto, el segundo
  // render deja dos campos en el DOM y `getByRole` falla por ambigüedad.
  afterEach(cleanup);

  const opcion: ToolOption = {
    id: 'distance', label: 'Distancia (mm)', type: 'number',
    value: 10, min: 1, max: 200, step: 1, control: 'input',
  };

  const escribir = (texto: string) => {
    const alCambiar = vi.fn();
    render(<Control opcion={opcion} valor={10} alCambiar={alCambiar} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: texto } });
    return alCambiar;
  };

  it('999 en un campo de máximo 200 llega al store como 200', () => {
    // Con deslizador esto no podía pasar: el rango se cumplía por construcción.
    // Es el mismo acotado que `confirmarMargen` ya hace en la tira.
    expect(escribir('999')).toHaveBeenLastCalledWith(200);
  });

  it('0 en un campo de mínimo 1 llega como 1', () => {
    expect(escribir('0')).toHaveBeenLastCalledWith(1);
  });

  it('un número dentro del rango pasa intacto, con decimales incluidos', () => {
    // 137 es el caso de María: alcanzable en teoría con el deslizador de 200
    // posiciones, imposible en la práctica con ~100 px de ancho.
    expect(escribir('137')).toHaveBeenLastCalledWith(137);
  });

  it('el campo vacío no manda cero: se puede borrar para escribir de nuevo', () => {
    // El borrador local ya existe y esto lo protege: vaciar el campo para
    // teclear «300» tecla a tecla no puede escribir un 0 en el store por el
    // camino.
    expect(escribir('')).not.toHaveBeenCalled();
  });

  it('y no acota lo que no tiene rango declarado', () => {
    const sinRango: ToolOption = {
      id: 'x', label: 'Cualquiera', type: 'number', value: 1, control: 'input',
    };
    const alCambiar = vi.fn();
    render(<Control opcion={sinRango} valor={1} alCambiar={alCambiar} />);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5000' } });
    expect(alCambiar).toHaveBeenLastCalledWith(5000);
  });
});
