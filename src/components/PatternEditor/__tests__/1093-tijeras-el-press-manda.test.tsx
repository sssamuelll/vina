// @vitest-environment jsdom
/**
 * #1093 — María, audio 2026-08-30 [15:33]: "ya sigo en el menú cortar y no me
 * detecta nada. Tengo que salir y volver a entrar."
 *
 * Tijeras exigía una pieza SELECCIONADA para cortar, y `removePiece` (el
 * primer corte) vacía la selección: el segundo corte no tenía sujeto y el
 * gesto moría en silencio. El press manda el objeto (spec 2026-08-11 § 4.1):
 * el borde bajo el cursor es el sujeto del corte, esté o no seleccionada la
 * pieza; y tras cortar, las dos mitades quedan seleccionadas para que se
 * vean ("a veces no se iluminan las cosas").
 *
 * De paso: "Conservar las dos partes" (`keepBoth`) y "Tipo de corte"
 * (`cutType`) eran opciones que nadie leía. Se van del catálogo.
 *
 * Segunda ronda (review de codex, 2026-08-30): el press solo puede tomar lo
 * que se VE y se puede editar — ni capas ocultas, ni piezas o capas
 * bloqueadas — y entre dos piezas superpuestas gana la de arriba (zOrder).
 * Si el objetivo desapareció a mitad de corte, el siguiente press empieza de
 * cero. Y la confirmación diferida no resucita una pieza borrada mientras el
 * diálogo estaba abierto.
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import editorReducer, { selectPiece } from '../../../store/editorSlice';
import projectReducer, { addPiece, removePiece, setLayerLocked } from '../../../store/projectSlice';
import toolReducer from '../../../store/toolSlice';
import workflowReducer, { setExpertMode } from '../../../store/workflowSlice';
import simulationReducer, { toggleLayerVisibility } from '../../../store/simulationSlice';
import copilotUIReducer from '../../../store/copilotUISlice';
import { resolveCallback, _resetCallbacksForTest } from '../../../hooks/useGuardedAction';
import { useScissorsTool } from '../useScissorsTool';
import { scissorsTool } from '../../../tools/definitions/scissors';
import type { PatternPiece } from '../../../types/types';

function pieza(id: string, x: number, extra: Partial<PatternPiece> = {}): PatternPiece {
  return {
    id, name: id,
    outline: [
      { type: 'M', values: [0, 0] }, { type: 'L', values: [200, 0] },
      { type: 'L', values: [200, 150] }, { type: 'L', values: [0, 150] }, { type: 'Z', values: [] },
    ],
    internals: [], position: { x, y: 100 }, rotation: 0, mirrored: false,
    seamAllowance: 0, createdAt: 1, updatedAt: 1, active: true, layer: 1,
    ...extra,
  } as PatternPiece;
}

/** zoom 1, pan 0, svg en (0,0): las coordenadas de pantalla SON las de patrón. */
function ev(x: number, y: number) {
  return {
    button: 0, clientX: x, clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
  } as unknown as React.MouseEvent<SVGSVGElement>;
}

function montar(piezas: PatternPiece[], seleccion: string | null, opts: { confirmar?: boolean } = {}) {
  _resetCallbacksForTest();
  const store = configureStore({
    reducer: {
      editor: editorReducer, project: projectReducer, tools: toolReducer,
      workflow: workflowReducer, simulation: simulationReducer, copilotUI: copilotUIReducer,
    },
  });
  for (const p of piezas) store.dispatch(addPiece(p));
  if (seleccion) store.dispatch(selectPiece(seleccion));
  // Sin el diálogo de confirmación salvo que el test lo pida: aquí se mide el corte.
  if (!opts.confirmar) store.dispatch(setExpertMode(true));
  const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;
  const hook = renderHook(() => useScissorsTool(1, { x: 0, y: 0 }), { wrapper });
  const tool = () => hook.result.current;
  const press = (x: number, y: number) => act(() => tool().handleMouseDown(ev(x, y)));
  return { store, tool, press };
}

describe('#1093 — Tijeras: el press manda el objeto', () => {
  it('sin selección, el press sobre un borde toma esa pieza y fija el inicio del corte', () => {
    const { tool, press } = montar([pieza('A', 100)], null);
    press(200, 100); // punto medio del borde de arriba de A
    expect(tool().targetPieceId).toBe('A');
    expect(tool().startPoint).toEqual({ x: 200, y: 100 });
  });

  it('con otra pieza seleccionada, manda el borde bajo el cursor', () => {
    const { tool, press } = montar([pieza('A', 100), pieza('B', 400)], 'A');
    press(500, 100); // borde de arriba de B
    expect(tool().targetPieceId).toBe('B');
  });

  it('el press en vacío no deja a Tijeras sosteniendo ninguna pieza', () => {
    const { tool, press } = montar([pieza('A', 100)], 'A');
    press(700, 700);
    expect(tool().targetPieceId).toBeNull();
    expect(tool().startPoint).toBeNull();
  });

  it('dos cortes seguidos sin salir de Tijeras; tras cada corte las dos mitades quedan seleccionadas', () => {
    const { store, press } = montar([pieza('A', 100)], 'A');
    press(200, 100);
    press(200, 250);
    const tras1 = store.getState();
    expect(tras1.project.pieces).toHaveLength(2);
    expect([...tras1.editor.selectedPieceIds].sort()).toEqual(tras1.project.pieces.map((p) => p.id).sort());

    // La mitad izquierda conserva la posición (100,100) y va de x=100 a x=200.
    press(150, 100);
    press(150, 250);
    const tras2 = store.getState();
    expect(tras2.project.pieces).toHaveLength(3);
    expect(tras2.editor.selectedPieceIds).toHaveLength(2);
  });

  it('"Conservar las dos partes" y "Tipo de corte" ya no están en el catálogo: nadie las leía', () => {
    const ids = (scissorsTool.options ?? []).map((o) => o.id);
    expect(ids).not.toContain('keepBoth');
    expect(ids).not.toContain('cutType');
    expect(Object.keys(scissorsTool.copilot?.parameterHints ?? {})).not.toContain('cutType');
  });

  it('la metadata dice lo que hace: Tijeras ya no exige selección', () => {
    expect(scissorsTool.copilot?.requiresSelection).toBe('none');
  });
});

describe('#1093 — el press solo toma lo que se ve y se puede editar', () => {
  it('una pieza en una capa oculta no se corta', () => {
    const { store, tool, press } = montar([pieza('A', 100, { layer: 2 })], null);
    store.dispatch(toggleLayerVisibility(2));
    press(200, 100);
    expect(tool().targetPieceId).toBeNull();
  });

  it('una pieza bloqueada no se corta', () => {
    const { tool, press } = montar([pieza('A', 100, { locked: true })], null);
    press(200, 100);
    expect(tool().targetPieceId).toBeNull();
  });

  it('una pieza en una capa bloqueada no se corta', () => {
    const { store, tool, press } = montar([pieza('A', 100, { layer: 3 })], null);
    store.dispatch(setLayerLocked({ layer: 3, locked: true }));
    press(200, 100);
    expect(tool().targetPieceId).toBeNull();
  });

  it('entre dos piezas superpuestas gana la de arriba (zOrder), aunque venga después en la lista', () => {
    // Las dos comparten el borde de arriba en y=100 entre x=150 y x=300.
    const abajo = pieza('abajo', 100, { zOrder: 1 });
    const arriba = pieza('arriba', 150, { zOrder: 5 });
    const { tool, press } = montar([abajo, arriba], null);
    press(220, 100);
    expect(tool().targetPieceId).toBe('arriba');
  });
});

describe('#1093 — el objetivo puede desaparecer a mitad de corte', () => {
  it('si la pieza objetivo ya no existe, el siguiente press empieza un corte nuevo sobre lo que haya debajo', () => {
    const { store, tool, press } = montar([pieza('A', 100), pieza('C', 400)], null);
    press(200, 100);
    expect(tool().targetPieceId).toBe('A');
    act(() => { store.dispatch(removePiece('A')); });
    press(500, 100); // borde de arriba de C
    expect(tool().targetPieceId).toBe('C');
    expect(tool().startPoint).toEqual({ x: 500, y: 100 });
  });

  it('la confirmación diferida no resucita una pieza borrada mientras el diálogo estaba abierto', () => {
    const { store, press } = montar([pieza('A', 100)], null, { confirmar: true });
    press(200, 100);
    press(200, 250);
    const key = store.getState().copilotUI.pendingConfirmation?.callbackKey;
    expect(key, 'no se registró la confirmación del corte').toBeTruthy();
    // Supr con el diálogo abierto (o deshacer, o cambiar de proyecto): A se va.
    act(() => { store.dispatch(removePiece('A')); });
    act(() => { resolveCallback(key!)?.(); });
    expect(store.getState().project.pieces).toEqual([]);
  });
});
