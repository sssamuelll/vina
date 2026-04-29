import { describe, it, expect } from 'vitest';
import { Object3D } from 'three';
import { metresToImporter, importerToMetres } from '../boundaries';

describe('metresToImporter', () => {
  it('converts 1.7 m to 1700 mm', () => {
    expect(metresToImporter(1.7)).toBe(1700);
  });
  it('converts 1 m to 1000 mm', () => {
    expect(metresToImporter(1)).toBe(1000);
  });
  it('converts 0', () => {
    expect(metresToImporter(0)).toBe(0);
  });
  it('handles fractional', () => {
    expect(metresToImporter(0.001)).toBe(1);
  });
});

describe('importerToMetres', () => {
  it('multiplies scene scale by 0.001', () => {
    const scene = new Object3D();
    expect(scene.scale.x).toBe(1);
    importerToMetres(scene);
    expect(scene.scale.x).toBeCloseTo(0.001, 10);
    expect(scene.scale.y).toBeCloseTo(0.001, 10);
    expect(scene.scale.z).toBeCloseTo(0.001, 10);
  });
  it('compounds when called twice', () => {
    const scene = new Object3D();
    importerToMetres(scene);
    importerToMetres(scene);
    expect(scene.scale.x).toBeCloseTo(0.000001, 12);
  });
  it('applies to non-default scale', () => {
    const scene = new Object3D();
    scene.scale.set(2, 2, 2);
    importerToMetres(scene);
    expect(scene.scale.x).toBeCloseTo(0.002, 10);
  });
});
