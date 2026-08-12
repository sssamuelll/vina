// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HintText from '../HintText';

// Sin `globals: true` en vitest.config, RTL no auto-registra el cleanup —
// sin esto los <text> de un test quedan en el DOM del siguiente y "costura"
// matchea dos veces (convención del propio repo, ver sewingOverlays.curvas.test.tsx).
afterEach(cleanup);

const svg = (ui: React.ReactNode) => render(<svg>{ui}</svg>);

// Props base requeridas por HintTextProps que el snippet del brief omite
// (pieces/penNodesLength/nodeEditorIsEditing no son opcionales) — sin esto
// `npx tsc -b --noEmit` rompe el gate aunque vitest corra igual.
const base = { pieces: [], penNodesLength: 0, nodeEditorIsEditing: false };

// Las aserciones apuntan al SIGNIFICADO que la frase tiene que transmitir, no
// a su redacción: el texto lo afina `solace-wren` y no debería romper el test
// cada vez que cambia una palabra. Lo que sí tiene que seguir estando es la
// información — que es lo único que la usuaria necesita del pie del lienzo.
describe('HintText — coser', () => {
  it('en reposo contrasta los dos gestos y sus dos extensiones', () => {
    svg(<HintText {...base} activeTool="seam" seamPhase="idle" />);
    const hint = screen.getByText(/clic/i).textContent ?? '';
    expect(hint).toMatch(/arrastr/i);      // arrastra / arrastre
    expect(hint).toMatch(/entero/i);       // lo que da el clic
    expect(hint).toMatch(/tramo/i);        // lo que da el arrastre
  });

  it('sosteniendo la primera mitad pide la segunda pieza y ofrece salida', () => {
    svg(<HintText {...base} activeTool="seam" seamPhase="holdingA" />);
    const hint = screen.getByText(/otra pieza/i).textContent ?? '';
    // Sin una salida nombrada, se queda atrapada sosteniendo la mitad A: la
    // regresión que cazó la revisión final de la tanda.
    expect(hint).toMatch(/esc/i);
  });
});

describe('HintText — editar costuras', () => {
  it('dice que el clic revela con qué está cosido', () => {
    svg(<HintText {...base} activeTool="seamEdit" />);
    const hint = screen.getByText(/clic/i).textContent ?? '';
    expect(hint).toMatch(/cosid|costura/i);
  });
});
