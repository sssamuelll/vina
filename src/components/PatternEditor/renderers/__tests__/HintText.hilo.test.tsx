// @vitest-environment jsdom
/**
 * #1107 — "no hay mucha información, ahí parece que es un atajo pero no se
 * ve" (María, 32:47). El hilo (`grainline`) es la ÚNICA herramienta del
 * dock sin pista al pie — HintText no tiene ninguna rama para ella.
 * Como en HintText.sew.test.tsx: se asevera el SIGNIFICADO, no la redacción.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HintText from '../HintText';

afterEach(cleanup);

const svg = (ui: React.ReactNode) => render(<svg>{ui}</svg>);
const base = { pieces: [], penNodesLength: 0, nodeEditorIsEditing: false };

describe('#1107 — HintText del hilo', () => {
  it('dice que se arrastra dentro de la pieza y que Shift engancha el ángulo', () => {
    svg(<HintText {...base} activeTool="grainline" />);
    const hint = screen.getByText(/arrastr|pieza/i).textContent ?? '';
    expect(hint).toMatch(/pieza/i);
    expect(hint).toMatch(/arrastr/i);
    expect(hint).toMatch(/shift/i);
    // Los tres ángulos que engancha (#1107: "¿cómo sé que este es cero?").
    expect(hint).toMatch(/0/);
    expect(hint).toMatch(/90/);
  });
});
