// @vitest-environment jsdom
/**
 * Panel "Siguiente punto" (spec 2026-08-29 § 7.2, María #195 y #193): largo y
 * ángulo del próximo nodo. Sin oyente en `window`: sus teclas se manejan en
 * React y detienen la propagación, así ni el router de herramientas ni los
 * atajos globales ven lo que se teclea dentro (§ 8).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import NextPointPanel from '../NextPointPanel';

afterEach(cleanup);

function setup(length = 80, angle = -90) {
  const onPlace = vi.fn();
  const onClose = vi.fn();
  render(<NextPointPanel initialLengthMm={length} initialAngleDeg={angle} onPlace={onPlace} onClose={onClose} />);
  const largo = screen.getByLabelText(/largo/i) as HTMLInputElement;
  const angulo = screen.getByLabelText(/ángulo/i) as HTMLInputElement;
  return { onPlace, onClose, largo, angulo };
}

describe('NextPointPanel', () => {
  it('se prefija con la goma y enfoca Largo', () => {
    const { largo, angulo } = setup();
    expect(largo.value).toBe('80.0');
    expect(angulo.value).toBe('-90.0');
    expect(document.activeElement).toBe(largo);
  });

  it('Enter coloca con los valores escritos y el panel se queda abierto con ellos', () => {
    const { largo, angulo, onPlace, onClose } = setup();
    fireEvent.change(largo, { target: { value: '50' } });
    fireEvent.change(angulo, { target: { value: '0' } });
    fireEvent.keyDown(angulo, { key: 'Enter' });
    expect(onPlace).toHaveBeenCalledWith(50, 0);
    expect(onClose).not.toHaveBeenCalled();
    expect(largo.value).toBe('50');
    expect(document.activeElement).toBe(largo);
  });

  it('Escape cierra sin colocar', () => {
    const { largo, onPlace, onClose } = setup();
    fireEvent.keyDown(largo, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPlace).not.toHaveBeenCalled();
  });

  it('un largo vacío o cero no coloca', () => {
    const { largo, onPlace } = setup();
    fireEvent.change(largo, { target: { value: '' } });
    fireEvent.keyDown(largo, { key: 'Enter' });
    fireEvent.change(largo, { target: { value: '0' } });
    fireEvent.keyDown(largo, { key: 'Enter' });
    expect(onPlace).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: /colocar punto/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('las teclas que nacen dentro no llegan ni a document ni a window', () => {
    const { largo } = setup();
    const doc = vi.fn();
    const win = vi.fn();
    document.addEventListener('keydown', doc);
    window.addEventListener('keydown', win);
    fireEvent.keyDown(largo, { key: 'Backspace' });
    fireEvent.keyDown(largo, { key: 'Tab' });
    document.removeEventListener('keydown', doc);
    window.removeEventListener('keydown', win);
    expect(doc).not.toHaveBeenCalled();
    expect(win).not.toHaveBeenCalled();
  });

  it('la hoja de estilos no trae colores literales', () => {
    // vitest corre desde la raíz del repo; en jsdom `import.meta.url` no es file:.
    const css = readFileSync(join(process.cwd(), 'src/components/PatternEditor/NextPointPanel.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).toMatch(/:focus-visible/);
  });
});
