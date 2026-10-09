/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { toolRegistry } from '../index';
import { DEFAULT_NOTCH_OPTIONS } from '../../utils/notches';

/**
 * El piquete en la línea al pie (spec 2026-10-02 § 5.3 y § 5.2): forma,
 * cantidad, profundidad y ancho, ANTES del clic, como botones a un clic. El
 * ancho solo estaba en Propiedades; los rangos son los que tenía Propiedades
 * (que P4 borró), más amplios que los de la herramienta, para que ningún
 * valor guardado quede fuera.
 */
afterEach(cleanup);

const opciones = toolRegistry.getTool('notch')!.options!;
const de = (id: string) => opciones.find((o) => o.id === id)!;

describe('el piquete al pie', () => {
  it('las cuatro, en el orden de la spec', () => {
    expect(opciones.map((o) => o.id)).toEqual(['shape', 'count', 'length', 'width']);
  });

  it('el ancho gana su sitio, con el rango que tenía Propiedades (1 a 20 mm)', () => {
    expect(de('width')).toMatchObject({ type: 'number', label: 'Ancho (mm)', min: 1, max: 20, value: DEFAULT_NOTCH_OPTIONS.width });
  });

  it('la profundidad toma el rango que tenía Propiedades (1 a 30 mm)', () => {
    expect(de('length')).toMatchObject({ type: 'number', label: 'Profundidad (mm)', min: 1, max: 30, value: DEFAULT_NOTCH_OPTIONS.length });
  });

  it('la cantidad se lee «1 2 3» y nace en la de fábrica', () => {
    expect(de('count').choices!.map((c) => c.label)).toEqual(['1', '2', '3']);
    expect(de('count').value).toBe(DEFAULT_NOTCH_OPTIONS.count);
  });

  it('las siete formas traen su dibujo, y los siete dibujos son distintos', () => {
    const formas = de('shape').choices!;
    expect(formas).toHaveLength(7);
    const trazos = formas.map((c) => {
      const Icono = c.icon!;
      const { container, unmount } = render(<Icono size={16} />);
      const d = [...container.querySelectorAll('path')].map((p) => p.getAttribute('d')).join(' | ');
      unmount();
      return d;
    });
    expect(new Set(trazos).size).toBe(7);
  });
});
