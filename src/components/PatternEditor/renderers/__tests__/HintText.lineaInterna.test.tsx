// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HintText from '../HintText';

afterEach(cleanup);

const svg = (ui: React.ReactNode) => render(<svg>{ui}</svg>);
const base = { pieces: [], penNodesLength: 0, nodeEditorIsEditing: false };

// Como en HintText.sew.test.tsx: se asevera el SIGNIFICADO, no la redacción.
// Es la única cosa que le explica a María cómo se usa la herramienta (spec
// 2026-08-29 § 4.7), y la puerta visible de Tab (PR B) irá aquí también.
describe('HintText — línea interna', () => {
  it('sin trazo dice dónde empezar y que hay enganche', () => {
    svg(<HintText {...base} activeTool="internalShape" internalShapeNodesLength={0} />);
    const hint = screen.getByText(/clic/i).textContent ?? '';
    expect(hint).toMatch(/pieza/i);
    expect(hint).toMatch(/esquina|borde|engancha/i);
  });

  it('con trazo dice cómo curvar, terminar, cerrar, retroceder y salir', () => {
    svg(<HintText {...base} activeTool="internalShape" internalShapeNodesLength={2} />);
    const hint = screen.getByText(/clic/i).textContent ?? '';
    expect(hint).toMatch(/arrastr/i);
    expect(hint).toMatch(/enter/i);
    expect(hint).toMatch(/cierra|cerrar/i);
    expect(hint).toMatch(/retroceso/i);
    expect(hint).toMatch(/esc/i);
    // La puerta visible de "Siguiente punto" (spec § 7.2): Tab se nombra aquí.
    expect(hint).toMatch(/tab/i);
  });
});

describe('HintText — pluma y rectángulo (medidas escritas)', () => {
  it('la pluma con trazo nombra Tab, cerrar, terminar, retroceder y salir', () => {
    svg(<HintText {...base} activeTool="pen" penNodesLength={2} />);
    const hint = screen.getByText(/clic/i).textContent ?? '';
    expect(hint).toMatch(/tab/i);
    expect(hint).toMatch(/cierra|cerrar/i);
    expect(hint).toMatch(/enter/i);
    expect(hint).toMatch(/retroceso/i);
    expect(hint).toMatch(/esc/i);
  });

  it('el rectángulo dice que un clic crea con el último tamaño y que sus cotas se escriben', () => {
    svg(<HintText {...base} activeTool="rectangle" />);
    const hint = screen.getByText(/clic/i).textContent ?? '';
    expect(hint).toMatch(/último tamaño/i);
    expect(hint).toMatch(/cotas/i);
    expect(hint).toMatch(/arrastr/i);
  });

  it('con cotas visibles y Seleccionar, la pista nombra la cota, el arrastre y Tab', () => {
    svg(<HintText {...base} activeTool="select" cotasVisibles />);
    const hint = screen.getByText(/cota/i).textContent ?? '';
    expect(hint).toMatch(/escribirla/i);
    expect(hint).toMatch(/arrástrala/i);
    expect(hint).toMatch(/tab/i);
  });
});
