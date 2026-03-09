import { describe, it, expect } from 'vitest';

describe('turntableRenderer', () => {
  it('exports renderTurntable and downloadBlob', async () => {
    const mod = await import('../turntableRenderer');
    expect(mod.renderTurntable).toBeDefined();
    expect(mod.downloadBlob).toBeDefined();
  });
});

describe('stillExporter', () => {
  it('exports exportStill, exportAllViews, and ViewAngle type', async () => {
    const mod = await import('../stillExporter');
    expect(mod.exportStill).toBeDefined();
    expect(mod.exportAllViews).toBeDefined();
  });
});
