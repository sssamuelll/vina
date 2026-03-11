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
});
