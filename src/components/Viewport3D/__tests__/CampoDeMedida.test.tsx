// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CampoDeMedida from '../CampoDeMedida';

afterEach(cleanup);

/** Sin argumento, 161,4; con `undefined` explícito, sin valor (un parámetro por defecto lo taparía). */
function campo(...arg: [number | undefined] | []) {
  const valor = arg.length ? arg[0] : 161.4;
  const alFijar = vi.fn();
  render(<CampoDeMedida id="m" label="Estatura" valor={valor} min={140} max={210} alFijar={alFijar} />);
  return { alFijar, input: screen.getByLabelText('Estatura') as HTMLInputElement };
}

describe('CampoDeMedida: una medida del cuerpo, un campo', () => {
  it('enseña el valor guardado tal cual, con coma', () => {
    expect(campo(161.4).input.value).toBe('161,4');
  });

  it('sin valor guardado sale vacío: no se inventa uno', () => {
    expect(campo(undefined).input.value).toBe('');
  });

  it('escribir no toca el cuerpo: se fija con Enter, una vez', () => {
    const { alFijar, input } = campo();
    for (const v of ['1', '17', '170']) fireEvent.change(input, { target: { value: v } });
    expect(alFijar).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).toHaveBeenCalledTimes(1);
    expect(alFijar).toHaveBeenCalledWith(170);
  });

  it('al salir del campo también se fija, y vale coma o punto', () => {
    const { alFijar, input } = campo();
    fireEvent.change(input, { target: { value: '165,5' } });
    fireEvent.blur(input);
    expect(alFijar).toHaveBeenLastCalledWith(165.5);
    fireEvent.change(input, { target: { value: '166.5' } });
    fireEvent.blur(input);
    expect(alFijar).toHaveBeenLastCalledWith(166.5);
  });

  it('fuera del rango se queda en el borde', () => {
    const { alFijar, input } = campo();
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).toHaveBeenLastCalledWith(210);
    fireEvent.change(input, { target: { value: '10' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).toHaveBeenLastCalledWith(140);
  });

  it('vacío o sin número vuelve al de antes y no escribe: borrar no es poner 0', () => {
    const { alFijar, input } = campo();
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'alto' } });
    fireEvent.blur(input);
    expect(alFijar).not.toHaveBeenCalled();
    expect(input.value).toBe('161,4');
  });

  it('el mismo valor no escribe: no deja un paso de deshacer vacío', () => {
    const { alFijar, input } = campo(170);
    fireEvent.change(input, { target: { value: '170' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(alFijar).not.toHaveBeenCalled();
  });

  it('Esc con algo tecleado lo deshace y se queda en el campo; sin nada tecleado, la tecla sigue su camino', () => {
    const { alFijar, input } = campo();
    const alPasar = vi.fn();
    document.addEventListener('keydown', alPasar);
    try {
      fireEvent.change(input, { target: { value: '170' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input.value).toBe('161,4');
      expect(alPasar).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(alPasar).toHaveBeenCalledTimes(1);
      fireEvent.blur(input);
      expect(alFijar).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', alPasar);
    }
  });

  it('la unidad describe el campo', () => {
    const { input } = campo();
    const describe = input.getAttribute('aria-describedby');
    expect(describe).toBeTruthy();
    expect(document.getElementById(describe!)!.textContent).toBe('cm');
  });
});
