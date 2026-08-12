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

describe('HintText — coser', () => {
  it('en reposo enseña las dos mitades del gesto', () => {
    svg(<HintText {...base} activeTool="seam" seamPhase="idle" />);
    expect(screen.getByText(/clic/i)).toBeTruthy();
    expect(screen.getByText(/arrastra/i)).toBeTruthy();
  });

  it('sosteniendo la primera mitad pide la segunda pieza', () => {
    svg(<HintText {...base} activeTool="seam" seamPhase="holdingA" />);
    expect(screen.getByText(/otra pieza/i)).toBeTruthy();
  });
});

describe('HintText — editar costuras', () => {
  it('dice qué hace el clic', () => {
    svg(<HintText {...base} activeTool="seamEdit" />);
    expect(screen.getByText(/costura/i)).toBeTruthy();
  });
});
