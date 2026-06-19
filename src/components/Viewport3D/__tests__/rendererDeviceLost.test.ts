/**
 * Registro de devices WebGPU del renderer marcados como perdidos (#901).
 *
 * Por qué existe: GarmentSimulation se DESMONTA en cada Stop (`useClothSim =
 * simulationState !== 'idle'`), así que cualquier ref por-montaje que recuerde
 * "el device del renderer murió" se pierde al reanudar — pero el `<Canvas>` y su
 * WebGPURenderer NO se desmontan, así que el device sigue muerto. Un device
 * perdido no revive in-place. Este registro vive a nivel de módulo y se keya por
 * el objeto GPUDevice (estable entre remounts de GarmentSimulation), de modo que
 * un remount sobre un device ya muerto lo detecta y se salta GPU en vez de
 * re-entrar al tier y re-congelar durante el init.
 */
import { describe, it, expect } from 'vitest';
import { markRendererDeviceLost, isRendererDeviceLost } from '../rendererDeviceLost';

describe('rendererDeviceLost registry', () => {
  it('un device no está perdido hasta que se marca', () => {
    const device = {} as unknown as GPUDevice;
    expect(isRendererDeviceLost(device)).toBe(false);
    markRendererDeviceLost(device);
    expect(isRendererDeviceLost(device)).toBe(true);
  });

  it('rastrea devices de forma independiente (keyado por identidad)', () => {
    const a = {} as unknown as GPUDevice;
    const b = {} as unknown as GPUDevice;
    markRendererDeviceLost(a);
    expect(isRendererDeviceLost(a)).toBe(true);
    expect(isRendererDeviceLost(b)).toBe(false);
  });

  it('marcar dos veces el mismo device es idempotente', () => {
    const device = {} as unknown as GPUDevice;
    markRendererDeviceLost(device);
    markRendererDeviceLost(device);
    expect(isRendererDeviceLost(device)).toBe(true);
  });
});
