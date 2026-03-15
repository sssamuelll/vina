import { describe, it, expect } from 'vitest';
import reducer, {
  setHdriPreset,
  setHdriRotation,
  setHdriCustomUrl,
  setToneMapping,
  setExposure,
  setBackgroundMode,
  setBackgroundColor,
  addLight,
  removeLight,
  updateLight,
  applyLightPreset,
  setGroundVisible,
  setShadowOpacity,
  setShadowBlur,
  setTurntableFrameCount,
  setTurntableDirection,
  HDRI_PRESETS,
  LIGHT_PRESETS,
  type RenderSettingsState,
} from '../renderSettingsSlice';

function initial(): RenderSettingsState {
  return reducer(undefined, { type: '@@INIT' });
}

describe('renderSettingsSlice', () => {
  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('has correct initial state', () => {
    const state = initial();
    expect(state.hdriPreset).toBe('studio-soft');
    expect(state.hdriRotation).toBe(0);
    expect(state.hdriCustomUrl).toBeNull();
    expect(state.toneMapping).toBe('aces');
    expect(state.exposure).toBe(1.0);
    expect(state.backgroundMode).toBe('solid');
    expect(state.backgroundColor).toBe('#e0e0e0');
    expect(state.lights).toEqual([]);
    expect(state.groundVisible).toBe(true);
    expect(state.shadowOpacity).toBe(0.4);
    expect(state.shadowBlur).toBe(2);
    expect(state.turntableFrameCount).toBe(36);
    expect(state.turntableDirection).toBe('cw');
  });

  // -----------------------------------------------------------------------
  // HDRI
  // -----------------------------------------------------------------------

  it('setHdriPreset updates preset and clears customUrl', () => {
    let state = initial();
    state = reducer(state, setHdriCustomUrl('https://example.com/env.hdr'));
    expect(state.hdriCustomUrl).toBe('https://example.com/env.hdr');
    expect(state.hdriPreset).toBe('custom');

    state = reducer(state, setHdriPreset('showroom'));
    expect(state.hdriPreset).toBe('showroom');
    expect(state.hdriCustomUrl).toBeNull();
  });

  it('setHdriRotation clamps to -180..180', () => {
    let state = reducer(initial(), setHdriRotation(200));
    expect(state.hdriRotation).toBe(180);

    state = reducer(state, setHdriRotation(-300));
    expect(state.hdriRotation).toBe(-180);

    state = reducer(state, setHdriRotation(45));
    expect(state.hdriRotation).toBe(45);
  });

  it('setHdriCustomUrl sets url and preset to custom', () => {
    const state = reducer(initial(), setHdriCustomUrl('https://example.com/my.hdr'));
    expect(state.hdriCustomUrl).toBe('https://example.com/my.hdr');
    expect(state.hdriPreset).toBe('custom');
  });

  it('setHdriCustomUrl with null keeps preset unchanged', () => {
    let state = reducer(initial(), setHdriPreset('sunset'));
    state = reducer(state, setHdriCustomUrl(null));
    expect(state.hdriCustomUrl).toBeNull();
    // preset should remain 'sunset' since we passed null
    expect(state.hdriPreset).toBe('sunset');
  });

  // -----------------------------------------------------------------------
  // Tone mapping & exposure
  // -----------------------------------------------------------------------

  it('setToneMapping changes tone mapping', () => {
    const state = reducer(initial(), setToneMapping('reinhard'));
    expect(state.toneMapping).toBe('reinhard');
  });

  it('setExposure clamps to 0.1..5.0', () => {
    let state = reducer(initial(), setExposure(0.01));
    expect(state.exposure).toBeCloseTo(0.1);

    state = reducer(state, setExposure(10));
    expect(state.exposure).toBeCloseTo(5.0);

    state = reducer(state, setExposure(2.5));
    expect(state.exposure).toBeCloseTo(2.5);
  });

  // -----------------------------------------------------------------------
  // Background
  // -----------------------------------------------------------------------

  it('setBackgroundMode changes mode', () => {
    const state = reducer(initial(), setBackgroundMode('solid'));
    expect(state.backgroundMode).toBe('solid');
  });

  it('setBackgroundColor changes color', () => {
    const state = reducer(initial(), setBackgroundColor('#ff0000'));
    expect(state.backgroundColor).toBe('#ff0000');
  });

  // -----------------------------------------------------------------------
  // Lights
  // -----------------------------------------------------------------------

  it('addLight creates a default light', () => {
    const state = reducer(initial(), addLight());
    expect(state.lights.length).toBe(1);
    expect(state.lights[0].color).toBe('#ffffff');
    expect(state.lights[0].intensity).toBe(1.0);
  });

  it('addLight enforces max 4 lights', () => {
    let state = initial();
    for (let i = 0; i < 6; i++) {
      state = reducer(state, addLight());
    }
    expect(state.lights.length).toBe(4);
  });

  it('removeLight removes by id', () => {
    let state = initial();
    state = reducer(state, addLight());
    state = reducer(state, addLight());
    expect(state.lights.length).toBe(2);

    const idToRemove = state.lights[0].id;
    state = reducer(state, removeLight(idToRemove));
    expect(state.lights.length).toBe(1);
    expect(state.lights.find((l) => l.id === idToRemove)).toBeUndefined();
  });

  it('removeLight with non-existent id does nothing', () => {
    let state = initial();
    state = reducer(state, addLight());
    state = reducer(state, removeLight('non-existent'));
    expect(state.lights.length).toBe(1);
  });

  it('updateLight modifies specific light properties', () => {
    let state = initial();
    state = reducer(state, addLight());
    const lightId = state.lights[0].id;

    state = reducer(state, updateLight({
      id: lightId,
      changes: { color: '#ff0000', intensity: 2.5 },
    }));

    const updated = state.lights.find((l) => l.id === lightId)!;
    expect(updated.color).toBe('#ff0000');
    expect(updated.intensity).toBe(2.5);
    // Unchanged properties remain
    expect(updated.width).toBe(1);
  });

  it('updateLight with non-existent id does nothing', () => {
    let state = initial();
    state = reducer(state, addLight());
    const before = { ...state.lights[0] };

    state = reducer(state, updateLight({
      id: 'non-existent',
      changes: { color: '#ff0000' },
    }));

    expect(state.lights[0].color).toBe(before.color);
  });

  it('applyLightPreset replaces lights array', () => {
    let state = initial();
    state = reducer(state, addLight());
    expect(state.lights.length).toBe(1);

    state = reducer(state, applyLightPreset('studio3Point'));
    expect(state.lights.length).toBe(3);
    expect(state.lights[0].id).toBe('key');
    expect(state.lights[1].id).toBe('fill');
    expect(state.lights[2].id).toBe('rim');
  });

  it('applyLightPreset with unknown preset does nothing', () => {
    let state = initial();
    state = reducer(state, addLight());
    state = reducer(state, applyLightPreset('nonExistentPreset'));
    // Lights remain unchanged
    expect(state.lights.length).toBe(1);
  });

  it('applyLightPreset softBox has 2 lights', () => {
    const state = reducer(initial(), applyLightPreset('softBox'));
    expect(state.lights.length).toBe(2);
    expect(state.lights[0].id).toBe('left');
    expect(state.lights[1].id).toBe('right');
  });

  it('applyLightPreset dramatic has 1 light', () => {
    const state = reducer(initial(), applyLightPreset('dramatic'));
    expect(state.lights.length).toBe(1);
    expect(state.lights[0].id).toBe('main');
    expect(state.lights[0].intensity).toBe(2.0);
  });

  // -----------------------------------------------------------------------
  // Ground & shadow
  // -----------------------------------------------------------------------

  it('setGroundVisible toggles ground', () => {
    let state = reducer(initial(), setGroundVisible(false));
    expect(state.groundVisible).toBe(false);
    state = reducer(state, setGroundVisible(true));
    expect(state.groundVisible).toBe(true);
  });

  it('setShadowOpacity clamps to 0..1', () => {
    let state = reducer(initial(), setShadowOpacity(-0.5));
    expect(state.shadowOpacity).toBe(0);

    state = reducer(state, setShadowOpacity(1.5));
    expect(state.shadowOpacity).toBe(1);

    state = reducer(state, setShadowOpacity(0.7));
    expect(state.shadowOpacity).toBeCloseTo(0.7);
  });

  it('setShadowBlur clamps to 0..5', () => {
    let state = reducer(initial(), setShadowBlur(-1));
    expect(state.shadowBlur).toBe(0);

    state = reducer(state, setShadowBlur(10));
    expect(state.shadowBlur).toBe(5);

    state = reducer(state, setShadowBlur(3.5));
    expect(state.shadowBlur).toBeCloseTo(3.5);
  });

  // -----------------------------------------------------------------------
  // Turntable
  // -----------------------------------------------------------------------

  it('setTurntableFrameCount updates frame count', () => {
    const state = reducer(initial(), setTurntableFrameCount(72));
    expect(state.turntableFrameCount).toBe(72);
  });

  it('setTurntableDirection changes direction', () => {
    const state = reducer(initial(), setTurntableDirection('ccw'));
    expect(state.turntableDirection).toBe('ccw');
  });

  // -----------------------------------------------------------------------
  // Preset constants
  // -----------------------------------------------------------------------

  it('HDRI_PRESETS has 6 entries', () => {
    expect(HDRI_PRESETS.length).toBe(6);
    const ids = HDRI_PRESETS.map((p) => p.id);
    expect(ids).toContain('studio-soft');
    expect(ids).toContain('studio-hard');
    expect(ids).toContain('showroom');
    expect(ids).toContain('outdoor-daylight');
    expect(ids).toContain('sunset');
    expect(ids).toContain('neutral-grey');
  });

  it('LIGHT_PRESETS has 3 entries', () => {
    const keys = Object.keys(LIGHT_PRESETS);
    expect(keys.length).toBe(3);
    expect(keys).toContain('studio3Point');
    expect(keys).toContain('softBox');
    expect(keys).toContain('dramatic');
  });
});
