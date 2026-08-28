import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginCascade,
  clearSolverEvents,
  currentCascadeGeneration,
  getSolverEvents,
  pushSolverEvent,
  SOLVER_EVENTS_MAX,
} from '../solverRuntimeTracker';

describe('solverRuntimeTracker — ring de eventos', () => {
  beforeEach(clearSolverEvents);

  it('beginCascade incrementa la generación y los eventos la llevan por defecto', () => {
    const g1 = beginCascade();
    pushSolverEvent('cascade:start');
    const g2 = beginCascade();
    pushSolverEvent('tier:selected', { tier: 'wasm' });

    expect(g2).toBe(g1 + 1);
    expect(currentCascadeGeneration()).toBe(g2);
    const [first, second] = getSolverEvents();
    expect(first).toMatchObject({ kind: 'cascade:start', generation: g1, data: {} });
    expect(second).toMatchObject({ kind: 'tier:selected', generation: g2, data: { tier: 'wasm' } });
    expect(typeof second.timestamp).toBe('number');
  });

  it('un evento con generación explícita conserva la suya aunque haya una corrida más nueva', () => {
    const old = beginCascade();
    beginCascade();
    pushSolverEvent('tier:failed', { tier: 'webgpu', stale: true }, old);
    expect(getSolverEvents()[0].generation).toBe(old);
  });

  it('conserva como máximo SOLVER_EVENTS_MAX entradas, desalojando la más vieja', () => {
    for (let i = 0; i < SOLVER_EVENTS_MAX + 5; i++) {
      pushSolverEvent('tier:diagnostic', { i });
    }
    const events = getSolverEvents();
    expect(events).toHaveLength(SOLVER_EVENTS_MAX);
    expect(events[0].data.i).toBe(5);
    expect(events[events.length - 1].data.i).toBe(SOLVER_EVENTS_MAX + 4);
  });
});
