/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, { addTrazo, updateTrazo, removeTrazo, removeTramoDeTrazo, restoreProject } from '../projectSlice';
import { saveProjectToJSON } from '../../utils/projectIO';
import { parseVinaProject } from '../../utils/projectSchema';
import type { PathCommand, Trazo } from '../../types/types';

const L = (x: number, y: number): PathCommand => ({ type: 'L', values: [x, y] });
const M = (x: number, y: number): PathCommand => ({ type: 'M', values: [x, y] });

function baseState(overrides: Record<string, any> = {}) {
  return {
    id: 'test', name: 'Test', pieces: [] as any[], seams: [], fabrics: [],
    avatar: { id: 'a', name: 'A', modelUrl: '', measurements: {} } as any,
    avatarMode: 'model' as const, avatarModelUrl: null, isDirty: false,
    arrangementOverrides: {}, groups: [], seamGroups: [], poms: [] as any[],
    pleats: [], elastics: [], trims: [],
    referenceImages: [], trazos: [] as Trazo[],
    colorways: [], activeColorwayId: null,
    layerNames: {}, layerLocked: {},
    loadDiagnostics: [],
    loadQuarantine: { pieces: [], seams: [], poms: [], seamGroups: [] },
    ...overrides,
  };
}

const trazo = (id: string, path: PathCommand[]): Trazo => ({ id, path, createdAt: 1 });

describe('projectSlice — trazos (spec 2026-09-12 § 2)', () => {
  it('addTrazo lo guarda tal cual y ensucia el proyecto', () => {
    const s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(10, 0)])));
    expect(s.trazos).toHaveLength(1);
    expect(s.trazos[0].path).toEqual([M(0, 0), L(10, 0)]);
    expect(s.isDirty).toBe(true);
  });

  it('updateTrazo reemplaza el path y removeTrazo lo quita', () => {
    let s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(10, 0)])));
    s = reducer(s, updateTrazo({ id: 't1', path: [M(0, 0), L(20, 0)] }));
    expect(s.trazos[0].path[1].values).toEqual([20, 0]);
    s = reducer(s, removeTrazo('t1'));
    expect(s.trazos).toHaveLength(0);
  });

  it('removeTramoDeTrazo del medio deja dos trazos; el original conserva su id', () => {
    let s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(100, 0), L(100, 100), L(0, 100)])));
    s = reducer(s, removeTramoDeTrazo({ trazoId: 't1', segmentIndex: 2 }));
    expect(s.trazos).toHaveLength(2);
    expect(s.trazos[0].id).toBe('t1');
    expect(s.trazos[0].path).toEqual([M(0, 0), L(100, 0)]);
    expect(s.trazos[1].id).not.toBe('t1');
    expect(s.trazos[1].path).toEqual([M(100, 100), L(0, 100)]);
  });

  it('removeTramoDeTrazo sobre un trazo de dos anclas lo borra entero', () => {
    let s = reducer(baseState() as any, addTrazo(trazo('t1', [M(0, 0), L(10, 0)])));
    s = reducer(s, removeTramoDeTrazo({ trazoId: 't1', segmentIndex: 1 }));
    expect(s.trazos).toHaveLength(0);
  });

  it('un proyecto viejo sin trazos carga con la lista vacía', () => {
    const viejo = { ...baseState() } as any;
    delete viejo.trazos;
    // El estado de partida trae un trazo del proyecto anterior: si el backfill
    // no corriera, sobreviviría a la carga y el test daría verde en falso.
    const previo = baseState({ trazos: [trazo('t-viejo', [M(0, 0), L(10, 0)])] });
    const s = reducer(previo as any, restoreProject(viejo));
    expect(s.trazos).toEqual([]);
  });

  it('los trazos sobreviven a guardar y volver a cargar', () => {
    // El viaje entero de una recarga: `stateToProject` escoge campo por campo
    // y `parseVinaProject` es la aduana de lectura. Si el trazo se cae en
    // cualquiera de las dos, se dibuja, se guarda en el estado y desaparece
    // al recargar, sin decir nada.
    const conTrazo = baseState({
      trazos: [trazo('t1', [M(0, 0), L(10, 0)])],
      // La aduana exige un avatar completo; el mock mínimo del resto no pasa.
      avatar: {
        id: 'a', name: 'A', modelUrl: '',
        measurements: { height: 170, chest: 90, waist: 70, hips: 95, shoulder: 40, armLength: 60, inseam: 78 },
      },
    });
    const guardado = parseVinaProject(JSON.parse(saveProjectToJSON(conTrazo as any)));
    expect(guardado.ok).toBe(true);
    const s = reducer(baseState() as any, restoreProject((guardado as any).project));
    expect(s.trazos).toEqual([trazo('t1', [M(0, 0), L(10, 0)])]);
  });
});
