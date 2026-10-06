// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import CotaChip, { AgruparCotas } from '../CotaChip';
import { COTA_OFFSET_PX } from '../cotasGeometry';
import type { Cota } from '../cotas';

/**
 * La cota de lo que se pone (spec 2026-10-02 § 5.2): el chip avisa cada tecla
 * —el lienzo enseña dónde quedará— y avisa una sola vez cuando la edición se
 * cierra, por Enter, Esc, Tab al salir o el blur del siguiente clic.
 */
afterEach(cleanup);

const distancia = (over: Partial<Cota> = {}): Cota => ({
  id: 'piquete-distancia', grupo: 'piquete', kind: 'borde', label: 'Distancia', valueMm: 60, unit: 'mm',
  min: 0, max: 1000, referenceLabel: 'de 300 mm', primary: true, scrub: false,
  a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});
const profundidad = (over: Partial<Cota> = {}): Cota => ({
  id: 'piquete-profundidad', grupo: 'piquete', kind: 'profundidad', label: 'Profundidad', valueMm: 8, unit: 'mm',
  min: 1, max: 30, primary: true, scrub: false,
  a: { x: 0, y: 0 }, b: { x: 60, y: 0 }, outward: { x: 0, y: -1 }, apply: () => null, ...over,
});

function monta(cotas: Cota[], onCommit = vi.fn()) {
  const noop = { onScrubStart: vi.fn(), onScrub: vi.fn(), onScrubEnd: vi.fn(), onScrubCancel: vi.fn() };
  render(
    <AgruparCotas cotas={cotas} pan2D={{ x: 0, y: 0 }} zoom2D={1}>
      <div className="cotas">
        {cotas.map(c => <CotaChip key={c.id} cota={c} left={0} top={0} zoom2D={1} onCommit={onCommit} {...noop} />)}
      </div>
    </AgruparCotas>,
  );
  return onCommit;
}
const abre = () => fireEvent.click(screen.getByRole('button'));
const campo = (nombre: string) => screen.getByRole('textbox', { name: nombre }) as HTMLInputElement;

describe('la cota de lo que se pone', () => {
  it('cada tecla válida llega a alEscribir; una inválida o fuera de rango lo limpia con null', () => {
    const alEscribir = vi.fn();
    monta([distancia({ alEscribir }), profundidad()]);
    abre();
    fireEvent.change(campo('Distancia'), { target: { value: '120' } });
    fireEvent.change(campo('Distancia'), { target: { value: '120,5' } });
    fireEvent.change(campo('Distancia'), { target: { value: 'x' } });
    fireEvent.change(campo('Distancia'), { target: { value: '5000' } });
    expect(alEscribir.mock.calls.map(c => c[0])).toEqual([120, 120.5, null, null]);
  });

  it('las flechas también mueven lo que se ve', () => {
    const alEscribir = vi.fn();
    monta([distancia({ alEscribir }), profundidad()]);
    abre();
    fireEvent.keyDown(campo('Distancia'), { key: 'ArrowUp' });
    expect(alEscribir).toHaveBeenLastCalledWith(61);
  });

  it.each([['Enter'], ['Escape']])('%s cierra la edición y avisa una sola vez', (key) => {
    const alCerrar = vi.fn();
    monta([distancia({ alCerrar }), profundidad()]);
    abre();
    fireEvent.keyDown(campo('Distancia'), { key });
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('el blur del siguiente clic también la cierra', () => {
    const alCerrar = vi.fn();
    monta([distancia({ alCerrar }), profundidad()]);
    abre();
    fireEvent.blur(campo('Distancia'));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('Tab entre los dos campos no cierra: confirma la distancia y pasa a la profundidad', () => {
    const alCerrar = vi.fn();
    const onCommit = monta([distancia({ alCerrar }), profundidad()]);
    abre();
    fireEvent.change(campo('Distancia'), { target: { value: '90' } });
    fireEvent.keyDown(campo('Distancia'), { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ id: 'piquete-distancia' }), 90, 'tab');
    expect(alCerrar).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(campo('Profundidad'));
  });

  it('junto a la distancia se lee cuánto mide el lado, en reposo y al escribir', () => {
    monta([distancia(), profundidad()]);
    expect(screen.getByRole('button').textContent).toBe('60 mm de 300 mm · 8 mm');
    abre();
    expect(campo('Distancia').closest('label')!.textContent).toContain('mm de 300 mm');
  });

  it('el grupo de un borde va por fuera de la pieza, como un chip suelto', () => {
    monta([distancia(), profundidad()]);
    // Punto medio (30, 0) más `outward` (0, −1) por el aire calibrado.
    expect(screen.getByRole('button').style.top).toBe(`${-COTA_OFFSET_PX}px`);
  });
});
