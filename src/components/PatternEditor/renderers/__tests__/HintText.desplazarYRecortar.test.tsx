// @vitest-environment jsdom
/**
 * #1178 — Desplazar contorno y Extender/Recortar no tenían pista al pie.
 *
 * Las dos se confirman con Enter y ninguna lo decía en pantalla: `canExecute`
 * de Offset tiene un solo consumidor en todo el repo —el propio atajo de
 * Enter— y nada en la tira ni en el lienzo enseñaba que esa tecla existe.
 * Extender/Recortar además necesita el modo, como topstitch/walkSeam: la
 * pista de "extender" no sirve mientras María está recortando.
 *
 * Se asevera el SIGNIFICADO, no la redacción — mismo criterio que
 * HintText.hilo.test.tsx.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HintText from '../HintText';

afterEach(cleanup);

const svg = (ui: React.ReactNode) => render(<svg>{ui}</svg>);
const base = { pieces: [], penNodesLength: 0, nodeEditorIsEditing: false };

describe('#1178 — HintText de Desplazar contorno', () => {
  it('dice que Enter aplica', () => {
    svg(<HintText {...base} activeTool="offsetOutline" />);
    const hint = screen.getByText(/enter/i).textContent ?? '';
    expect(hint).toMatch(/enter/i);
    expect(hint).toMatch(/aplica/i);
  });
});

describe('#1178 — HintText de Extender/Recortar', () => {
  it('en modo extender, sin extremo elegido, dice cómo empezar', () => {
    svg(<HintText {...base} activeTool="extendTrim" extendTrimMode="extend" extendTrimArmed={false} />);
    const hint = screen.getByText(/extremo|borde/i).textContent ?? '';
    expect(hint).toMatch(/extend/i);
  });

  it('en modo extender, con extremo elegido, dice que Enter confirma', () => {
    svg(<HintText {...base} activeTool="extendTrim" extendTrimMode="extend" extendTrimArmed={true} />);
    const hint = screen.getByText(/enter/i).textContent ?? '';
    expect(hint).toMatch(/enter/i);
  });

  it('en modo recortar, sin punto elegido, dice cómo empezar — y no habla de extender', () => {
    svg(<HintText {...base} activeTool="extendTrim" extendTrimMode="trim" extendTrimArmed={false} />);
    const hint = screen.getByText(/borde|recort/i).textContent ?? '';
    expect(hint).toMatch(/recort/i);
    expect(hint).not.toMatch(/extend/i);
  });

  it('en modo recortar, con punto elegido, dice que el clic decide el lado', () => {
    svg(<HintText {...base} activeTool="extendTrim" extendTrimMode="trim" extendTrimArmed={true} />);
    const hint = screen.getByText(/enter|lado/i).textContent ?? '';
    expect(hint).toMatch(/lado|enter/i);
  });
});
