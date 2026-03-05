/**
 * Unit tests for simulationSlice — lifecycle + particle distance.
 */
import { describe, it, expect } from 'vitest';
import reducer, {
  startSimulation,
  pauseSimulation,
  resetSimulation,
  setFabric,
  setDefaultFabric,
  setParticleDistance,
  setPieceParticleDistance,
  addSnapshot,
  removeSnapshot,
  setActiveSnapshot,
  clearSnapshots,
} from '../simulationSlice';

const initial = () => reducer(undefined, { type: '@@INIT' });

describe('simulationSlice', () => {
  describe('lifecycle', () => {
    it('starts in idle state', () => {
      expect(initial().simulationState).toBe('idle');
    });

    it('startSimulation → running', () => {
      const s = reducer(initial(), startSimulation());
      expect(s.simulationState).toBe('running');
    });

    it('pauseSimulation → paused', () => {
      const running = reducer(initial(), startSimulation());
      const s = reducer(running, pauseSimulation());
      expect(s.simulationState).toBe('paused');
    });

    it('resetSimulation → idle', () => {
      const running = reducer(initial(), startSimulation());
      const s = reducer(running, resetSimulation());
      expect(s.simulationState).toBe('idle');
    });
  });

  describe('fabric', () => {
    it('sets per-piece fabric', () => {
      const s = reducer(initial(), setFabric({ pieceId: 'p1', fabricId: 'denim' }));
      expect(s.pieceFabrics['p1']).toBe('denim');
    });

    it('sets default fabric', () => {
      const s = reducer(initial(), setDefaultFabric('silk'));
      expect(s.defaultFabricId).toBe('silk');
    });
  });

  describe('particle distance', () => {
    it('defaults to 5mm', () => {
      expect(initial().particleDistance).toBe(5);
    });

    it('sets global particle distance', () => {
      const s = reducer(initial(), setParticleDistance(3));
      expect(s.particleDistance).toBe(3);
    });

    it('clamps minimum to 2mm', () => {
      const s = reducer(initial(), setParticleDistance(0.5));
      expect(s.particleDistance).toBe(2);
    });

    it('clamps maximum to 20mm', () => {
      const s = reducer(initial(), setParticleDistance(50));
      expect(s.particleDistance).toBe(20);
    });

    it('sets per-piece particle distance', () => {
      const s = reducer(initial(), setPieceParticleDistance({ pieceId: 'p1', distance: 3 }));
      expect(s.pieceParticleDistance['p1']).toBe(3);
    });

    it('clamps per-piece distance to 2–20mm', () => {
      let s = reducer(initial(), setPieceParticleDistance({ pieceId: 'p1', distance: 1 }));
      expect(s.pieceParticleDistance['p1']).toBe(2);
      s = reducer(s, setPieceParticleDistance({ pieceId: 'p2', distance: 25 }));
      expect(s.pieceParticleDistance['p2']).toBe(20);
    });

    it('per-piece overrides are independent', () => {
      let s = reducer(initial(), setParticleDistance(10));
      s = reducer(s, setPieceParticleDistance({ pieceId: 'p1', distance: 3 }));
      expect(s.particleDistance).toBe(10);
      expect(s.pieceParticleDistance['p1']).toBe(3);
    });

    it('empty pieceParticleDistance by default', () => {
      expect(initial().pieceParticleDistance).toEqual({});
    });
  });

  describe('snapshots', () => {
    it('starts with empty snapshots', () => {
      expect(initial().snapshots).toEqual([]);
      expect(initial().activeSnapshotId).toBeNull();
    });

    it('addSnapshot adds metadata', () => {
      const s = reducer(initial(), addSnapshot({
        id: 'snap1', name: 'Version A', particleCount: 100, isAutoSave: false,
      }));
      expect(s.snapshots).toHaveLength(1);
      expect(s.snapshots[0].name).toBe('Version A');
      expect(s.snapshots[0].id).toBe('snap1');
    });

    it('addSnapshot limits to 4 entries', () => {
      let s = initial();
      for (let i = 0; i < 5; i++) {
        s = reducer(s, addSnapshot({
          id: `snap${i}`, name: `V${i}`, particleCount: 100, isAutoSave: false,
        }));
      }
      expect(s.snapshots).toHaveLength(4);
      // Oldest removed
      expect(s.snapshots[0].id).toBe('snap1');
    });

    it('removeSnapshot removes by id', () => {
      let s = reducer(initial(), addSnapshot({
        id: 'snap1', name: 'A', particleCount: 100, isAutoSave: false,
      }));
      s = reducer(s, removeSnapshot('snap1'));
      expect(s.snapshots).toHaveLength(0);
    });

    it('removeSnapshot clears activeSnapshotId if it matches', () => {
      let s = reducer(initial(), addSnapshot({
        id: 'snap1', name: 'A', particleCount: 100, isAutoSave: false,
      }));
      s = reducer(s, setActiveSnapshot('snap1'));
      s = reducer(s, removeSnapshot('snap1'));
      expect(s.activeSnapshotId).toBeNull();
    });

    it('setActiveSnapshot sets id', () => {
      const s = reducer(initial(), setActiveSnapshot('snap1'));
      expect(s.activeSnapshotId).toBe('snap1');
    });

    it('clearSnapshots resets all', () => {
      let s = reducer(initial(), addSnapshot({
        id: 'snap1', name: 'A', particleCount: 100, isAutoSave: false,
      }));
      s = reducer(s, setActiveSnapshot('snap1'));
      s = reducer(s, clearSnapshots());
      expect(s.snapshots).toEqual([]);
      expect(s.activeSnapshotId).toBeNull();
    });
  });
});
