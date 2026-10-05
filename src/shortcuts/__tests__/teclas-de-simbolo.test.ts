// @vitest-environment jsdom
/**
 * Las teclas de símbolo dependen del teclado: en el español, «/» es Mayús+7 y
 * «;» es Mayús+«,». `e.key` ya trae el símbolo, así que un atajo de símbolo
 * sin Mayús declarada no exige que esté suelta; si no, el título de «IA»
 * promete Ctrl+/ y en el teclado de María no abre nada. Las letras y el
 * Espacio siguen distinguiendo la Mayús: Espacio simula, Mayús+Espacio simula
 * en alta resolución.
 */
import { describe, expect, it } from 'vitest';
import { ShortcutRegistry } from '../ShortcutRegistry';
import { DEFAULT_SHORTCUTS } from '../defaults';

const registro = new ShortcutRegistry(DEFAULT_SHORTCUTS);
const tecla = (key: string, mods: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key, ...mods });

describe('teclas de símbolo y la Mayús', () => {
  it('Ctrl+/ llega con Mayús en un teclado español', () => {
    expect(registro.matchEvent(tecla('/', { ctrlKey: true, shiftKey: true }), ['global'])).toBe('copilot.focusChat');
  });

  it('«;» llega con Mayús en un teclado español', () => {
    expect(registro.matchEvent(tecla(';', { shiftKey: true }), ['global', '2d'])).toBe('tool.topstitchSeamline');
  });

  it('el Espacio sigue distinguiendo la Mayús', () => {
    expect(registro.matchEvent(tecla(' '), ['global'])).toBe('sim.toggle');
    expect(registro.matchEvent(tecla(' ', { shiftKey: true }), ['global'])).toBe('sim.hiRes');
  });

  it('y las letras también: Ctrl+Mayús+K no es la paleta', () => {
    expect(registro.matchEvent(tecla('K', { ctrlKey: true, shiftKey: true }), ['global'])).not.toBe('app.commandPalette');
  });
});
