/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { Control } from '../ToolOptionControls';
import type { ToolOption } from '../../../tools/types';

/**
 * Las opciones de una herramienta en la línea al pie (spec 2026-10-02 «la
 * interfaz en papel» § 5.3): «las opciones son botones, no listas». Todas las
 * alternativas a la vista y a un clic; una lista solo con más de ocho; un
 * número con sus botones de menos y más.
 */
afterEach(cleanup);

const Dibujo: React.FC<{ size?: number }> = () => <svg data-testid="dibujo" />;

function pintar(opcion: ToolOption, valor: unknown = opcion.value) {
  const alCambiar = vi.fn();
  render(<Control opcion={opcion} valor={valor} alCambiar={alCambiar} />);
  return alCambiar;
}

const lista: ToolOption = {
  id: 'tipo', label: 'Tipo', type: 'select', value: 'a',
  choices: [{ label: 'Opción A', value: 'a' }, { label: 'Opción B', value: 'b' }],
};
const cantidad: ToolOption = {
  id: 'count', label: 'Cantidad', type: 'select', value: 1,
  choices: [{ label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 }],
};
const profundidad: ToolOption = { id: 'length', label: 'Profundidad (mm)', type: 'number', value: 8, min: 1, max: 30, step: 1 };

describe('hasta ocho alternativas son botones', () => {
  it('un botón por alternativa, todas a la vista, y la elegida marcada', () => {
    pintar(lista, 'b');
    const grupo = screen.getByRole('group', { name: 'Tipo' });
    expect(grupo.id).toBe('opcion-tipo');
    expect(within(grupo).getByRole('button', { name: 'Opción A' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(grupo).getByRole('button', { name: 'Opción B' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('un clic da el valor con su tipo: un número sigue siendo número', () => {
    const alCambiar = pintar(cantidad);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(alCambiar).toHaveBeenLastCalledWith(2);
  });

  it('un valor guardado como texto marca igual su botón (la lista vieja guardaba "2")', () => {
    pintar(cantidad, '2');
    expect(screen.getByRole('button', { name: '2' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('con dibujo, el botón enseña el dibujo y se llama como su alternativa', () => {
    const forma: ToolOption = {
      id: 'shape', label: 'Forma', type: 'select', value: 'slit',
      choices: [{ label: 'Recta', value: 'slit', icon: Dibujo }, { label: 'En T', value: 't-notch', icon: Dibujo }],
    };
    pintar(forma);
    const recta = screen.getByRole('button', { name: 'Recta' });
    expect(recta.querySelector('[data-testid="dibujo"]')).not.toBeNull();
    expect(recta.textContent).toBe('');
    expect(recta.getAttribute('title')).toBe('Recta');
  });

  it('con más de ocho, una lista desplegable que devuelve el valor con su tipo', () => {
    const nueve: ToolOption = {
      id: 'avio', label: 'Avío', type: 'select', value: 1,
      choices: Array.from({ length: 9 }, (_, i) => ({ label: `Avío ${i}`, value: i })),
    };
    const alCambiar = pintar(nueve);
    const desplegable = screen.getByLabelText('Avío');
    expect(desplegable.tagName).toBe('SELECT');
    expect(desplegable.id).toBe('opcion-avio');
    fireEvent.change(desplegable, { target: { value: '3' } });
    expect(alCambiar).toHaveBeenLastCalledWith(3);
  });
});

describe('un número es un campo con sus botones de menos y más', () => {
  it('el campo se rotula y se teclea; Restar y Sumar van a su lado', () => {
    pintar(profundidad);
    const campo = screen.getByLabelText('Profundidad (mm)');
    expect(campo.getAttribute('type')).toBe('number');
    expect(campo.id).toBe('opcion-length');
    expect(screen.getByRole('button', { name: 'Restar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sumar' })).toBeTruthy();
  });

  it('Sumar y Restar mueven un paso', () => {
    const alCambiar = pintar(profundidad, 8);
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(9);
    fireEvent.click(screen.getByRole('button', { name: 'Restar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(7);
  });

  it('en el borde del rango, el botón que se saldría está apagado', () => {
    pintar(profundidad, 30);
    expect((screen.getByRole('button', { name: 'Sumar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Restar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('con paso de 0,1 no deja colas de coma flotante en el store', () => {
    const fina: ToolOption = { id: 'f', label: 'Fina', type: 'number', value: 0.2, min: 0, max: 5, step: 0.1 };
    const alCambiar = pintar(fina, 0.2);
    fireEvent.click(screen.getByRole('button', { name: 'Sumar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(0.3);
  });

  it('los botones de paso no entran en el orden del teclado: con el foco en el campo, las flechas hacen lo mismo', () => {
    pintar(profundidad);
    expect(screen.getByRole('button', { name: 'Sumar' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('button', { name: 'Restar' }).getAttribute('tabindex')).toBe('-1');
  });
});

describe('interruptor y color', () => {
  it('el interruptor es un botón con su marca, sin texto encendido/apagado', () => {
    const alCambiar = pintar({ id: 'showAngle', label: 'Mostrar el ángulo', type: 'toggle', value: false });
    const boton = screen.getByRole('button', { name: 'Mostrar el ángulo' });
    expect(boton.id).toBe('opcion-showAngle');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(boton);
    expect(alCambiar).toHaveBeenLastCalledWith(true);
  });

  it('el color es el selector del navegador, rotulado', () => {
    pintar({ id: 'threadColor', label: 'Color del hilo', type: 'color', value: '#333333' });
    const color = screen.getByLabelText('Color del hilo');
    expect(color.getAttribute('type')).toBe('color');
    expect(color.id).toBe('opcion-threadColor');
  });
});
