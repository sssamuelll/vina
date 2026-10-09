// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EtiquetaDeOpcion, { type EtiquetaDeOpcionProps } from '../EtiquetaDeOpcion';
import { bajarLaEscalera } from '../../../../shortcuts/escaleraDeLoLlamado';
import type { ToolOption } from '../../../../tools/types';

/**
 * La etiqueta de opción (spec 2026-10-02 «la interfaz en papel» § 5.2): una
 * pastilla de la cabina que abre, en <body>, los MISMOS controles de la línea
 * al pie, pero para el objeto elegido.
 */

const TIPO: ToolOption = {
  id: 'type', label: 'Tipo de costura', type: 'select', value: 'standard',
  choices: [{ label: 'Normal', value: 'standard' }, { label: 'Francesa', value: 'french' }],
};
const PROFUNDIDAD: ToolOption = { id: 'length', label: 'Profundidad (mm)', type: 'number', value: 8, min: 1, max: 30, step: 1 };

function pintar(extra: Partial<EtiquetaDeOpcionProps> = {}) {
  const alCambiar = vi.fn();
  render(
    <EtiquetaDeOpcion
      que="costura"
      texto="Normal"
      nombre="Tipo de costura: Normal"
      nombreDelMenu="Opciones de la costura"
      opciones={[TIPO, PROFUNDIDAD]}
      valores={{ type: 'standard', length: 8 }}
      alCambiar={alCambiar}
      left={100}
      top={50}
      {...extra}
    />,
  );
  return { alCambiar, boton: screen.getByRole('button', { name: 'Tipo de costura: Normal' }) };
}
const menu = () => screen.queryByRole('group', { name: 'Opciones de la costura' });

afterEach(cleanup);

describe('EtiquetaDeOpcion (spec 2026-10-02 § 5.2)', () => {
  it('es una pastilla de la cabina, de papel, con su valor y cerrada', () => {
    const { boton } = pintar();
    expect(boton.textContent).toContain('Normal');
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    const raiz = boton.closest('[data-superficie="cabina"]');
    expect(raiz?.getAttribute('data-material')).toBe('papel');
    // Enter y Espacio son del botón que tiene el foco del teclado (contrato § 4).
    expect(raiz?.hasAttribute('data-botonera')).toBe(true);
    expect(menu()).toBeNull();
  });

  it('el clic abre en <body> un menú de papel con los controles del pie', () => {
    const { boton } = pintar();
    fireEvent.click(boton);
    const m = menu()!;
    expect(m.parentElement).toBe(document.body);
    expect(m.getAttribute('data-material')).toBe('papel');
    expect(m.getAttribute('data-superficie')).toBe('menu');
    expect(m.hasAttribute('data-botonera')).toBe(true);
    // Los ids no chocan con los de la línea al pie: `opcion-etiqueta-<id>` contra `opcion-<id>`.
    expect(m.querySelector('#opcion-etiqueta-type')).not.toBeNull();
    expect(m.querySelector('#opcion-type')).toBeNull();
    expect(boton.getAttribute('aria-expanded')).toBe('true');
  });

  it('elegir una alternativa escribe con el id de la opción, no el del control', () => {
    const { boton, alCambiar } = pintar();
    fireEvent.click(boton);
    fireEvent.click(screen.getByRole('button', { name: 'Francesa' }));
    expect(alCambiar).toHaveBeenCalledWith('type', 'french');
  });

  it('un número llega acotado a su rango', () => {
    const { boton, alCambiar } = pintar();
    fireEvent.click(boton);
    fireEvent.change(screen.getByLabelText('Profundidad (mm)'), { target: { value: '45' } });
    expect(alCambiar).toHaveBeenLastCalledWith('length', 30);
  });

  it('abierta con el teclado, el foco entra al menú; Esc la cierra antes que la selección y lo devuelve', () => {
    const { boton } = pintar();
    // Un clic del teclado (Enter, Espacio) llega con `detail` 0.
    fireEvent.click(boton, { detail: 0 });
    expect(menu()!.contains(document.activeElement)).toBe(true);
    let quien: string | null = null;
    act(() => { quien = bajarLaEscalera(); });
    expect(quien).toBe('etiqueta');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(boton);
  });

  it('abierta con el ratón, el foco se queda donde estaba', () => {
    const { boton } = pintar();
    fireEvent.click(boton, { detail: 1 });
    expect(menu()!.contains(document.activeElement)).toBe(false);
  });

  it('un clic fuera la cierra', () => {
    const { boton } = pintar();
    fireEvent.click(boton);
    fireEvent.mouseDown(document.body);
    expect(menu()).toBeNull();
  });

  it('apagada no abre: avisa', () => {
    const alPulsarApagada = vi.fn();
    const { boton } = pintar({ apagada: true, alPulsarApagada });
    fireEvent.click(boton);
    expect(alPulsarApagada).toHaveBeenCalledTimes(1);
    expect(boton.getAttribute('aria-disabled')).toBe('true');
    expect(menu()).toBeNull();
  });
});
