import { describe, it, expect } from 'vitest';
import { GpuSolverClient } from '../gpuSolverClient';

describe('GpuSolverClient', () => {
  it('exports GpuSolverClient class', () => {
    expect(GpuSolverClient).toBeDefined();
    expect(typeof GpuSolverClient).toBe('function');
  });

  it('has initMultiPieceTsl method', () => {
    expect(typeof GpuSolverClient.prototype.initMultiPieceTsl).toBe('function');
  });

  it('has getTslSolver accessor', () => {
    expect(typeof GpuSolverClient.prototype.getTslSolver).toBe('function');
  });

  it('has setTslCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.setTslCollisionBody).toBe('function');
  });

  it('has removeTslCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.removeTslCollisionBody).toBe('function');
  });

  it('has updateCollisionBody method', () => {
    expect(typeof GpuSolverClient.prototype.updateCollisionBody).toBe('function');
  });
});
