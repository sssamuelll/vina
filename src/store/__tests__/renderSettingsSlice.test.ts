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
  setResolutionPreset,
  setExportWidth,
  setExportHeight,
  setAspectRatioLocked,
  setImageFormat,
  setJpegQuality,
  setVideoFormat,
  setVideoFps,
  setSamplesPerPixel,
  setDenoiserEnabled,
  setAvatarRenderStyle,
  setExportTransparent,
  toggleAvatarVisible,
  selectAvatarVisible,
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

  it('LIGHT_PRESETS has 4 entries', () => {
    const keys = Object.keys(LIGHT_PRESETS);
    expect(keys.length).toBe(4);
    expect(keys).toContain('studio3Point');
    expect(keys).toContain('softBox');
    expect(keys).toContain('dramatic');
    expect(keys).toContain('natural');
  });

  // ─── Resolution ─────────────────────────────────────────────────────

  it('setResolutionPreset sets dimensions for 1080p', () => {
    const state = reducer(initial(), setResolutionPreset('1080p'));
    expect(state.resolutionPreset).toBe('1080p');
    expect(state.exportWidth).toBe(1920);
    expect(state.exportHeight).toBe(1080);
  });

  it('setResolutionPreset sets dimensions for 4k', () => {
    const state = reducer(initial(), setResolutionPreset('4k'));
    expect(state.exportWidth).toBe(3840);
    expect(state.exportHeight).toBe(2160);
  });

  it('setResolutionPreset sets dimensions for instagram', () => {
    const state = reducer(initial(), setResolutionPreset('instagram'));
    expect(state.exportWidth).toBe(1080);
    expect(state.exportHeight).toBe(1080);
  });

  it('setResolutionPreset sets dimensions for instagram-story', () => {
    const state = reducer(initial(), setResolutionPreset('instagram-story'));
    expect(state.exportWidth).toBe(1080);
    expect(state.exportHeight).toBe(1920);
  });

  it('setExportWidth sets width', () => {
    const state = reducer(initial(), setExportWidth(1920));
    expect(state.exportWidth).toBe(1920);
  });

  it('setExportHeight sets height', () => {
    const state = reducer(initial(), setExportHeight(1080));
    expect(state.exportHeight).toBe(1080);
  });

  it('setAspectRatioLocked toggles lock', () => {
    const state = reducer(initial(), setAspectRatioLocked(true));
    expect(state.aspectRatioLocked).toBe(true);
    const state2 = reducer(state, setAspectRatioLocked(false));
    expect(state2.aspectRatioLocked).toBe(false);
  });

  // ─── Format ─────────────────────────────────────────────────────────

  it('setImageFormat sets format', () => {
    const state = reducer(initial(), setImageFormat('jpeg'));
    expect(state.imageFormat).toBe('jpeg');
    const state2 = reducer(state, setImageFormat('webp'));
    expect(state2.imageFormat).toBe('webp');
  });

  it('setJpegQuality clamps to 0-1', () => {
    const state = reducer(initial(), setJpegQuality(0.8));
    expect(state.jpegQuality).toBe(0.8);
    const state2 = reducer(initial(), setJpegQuality(2.0));
    expect(state2.jpegQuality).toBe(1.0);
    const state3 = reducer(initial(), setJpegQuality(-0.5));
    expect(state3.jpegQuality).toBe(0);
  });

  it('setVideoFormat sets format', () => {
    const state = reducer(initial(), setVideoFormat('mp4'));
    expect(state.videoFormat).toBe('mp4');
  });

  it('setVideoFps clamps to valid range', () => {
    const state = reducer(initial(), setVideoFps(60));
    expect(state.videoFps).toBe(60);
  });

  it('setExportTransparent toggles transparency', () => {
    const state = reducer(initial(), setExportTransparent(true));
    expect(state.exportTransparent).toBe(true);
  });

  // ─── Quality ────────────────────────────────────────────────────────

  it('setSamplesPerPixel sets value', () => {
    const state = reducer(initial(), setSamplesPerPixel(16));
    expect(state.samplesPerPixel).toBe(16);
  });

  it('setDenoiserEnabled toggles denoiser', () => {
    const state = reducer(initial(), setDenoiserEnabled(true));
    expect(state.denoiserEnabled).toBe(true);
    const state2 = reducer(state, setDenoiserEnabled(false));
    expect(state2.denoiserEnabled).toBe(false);
  });

  // ─── Avatar Style ───────────────────────────────────────────────────

  it('setAvatarRenderStyle sets style', () => {
    const state = reducer(initial(), setAvatarRenderStyle('hidden'));
    expect(state.avatarRenderStyle).toBe('hidden');
    const state2 = reducer(state, setAvatarRenderStyle('wireframe'));
    expect(state2.avatarRenderStyle).toBe('wireframe');
    const state3 = reducer(state2, setAvatarRenderStyle('xray'));
    expect(state3.avatarRenderStyle).toBe('xray');
    const state4 = reducer(state3, setAvatarRenderStyle('visible'));
    expect(state4.avatarRenderStyle).toBe('visible');
  });
});

// El avatar a la vista (spec 2026-10-02 § 4.2, P5): el interruptor de la barra
// superior, Shift+A y el menú del 3D son la misma cosa, y viven en el store.
describe('el avatar a la vista (P5)', () => {
  it('ocultar y volver devuelve el estilo que había', () => {
    let s = reducer(initial(), setAvatarRenderStyle('wireframe'));
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('hidden');
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('wireframe');
  });

  it('desde «visible» oculta, y al volver queda «visible»', () => {
    let s = reducer(initial(), toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('hidden');
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('visible');
  });

  it('elegir un estilo desde el panel suelta el guardado', () => {
    let s = reducer(initial(), setAvatarRenderStyle('wireframe'));
    s = reducer(s, toggleAvatarVisible());           // oculto: guarda «wireframe»
    s = reducer(s, setAvatarRenderStyle('xray'));    // lo elige ella: ya se ve, y lo guardado ya no vale
    s = reducer(s, toggleAvatarVisible());           // oculta: guarda «xray»
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('xray');
  });

  it('el oculto que pone el copiloto no inventa un estilo guardado', () => {
    // `setAvatarRenderStyle('hidden')` es lo que hacen las herramientas de render
    // (guardan el anterior y lo restauran ellas): el interruptor, al volver, da «visible».
    let s = reducer(initial(), setAvatarRenderStyle('hidden'));
    s = reducer(s, toggleAvatarVisible());
    expect(s.avatarRenderStyle).toBe('visible');
  });

  it('selectAvatarVisible lee el estilo', () => {
    const oculto = reducer(initial(), toggleAvatarVisible());
    expect(selectAvatarVisible({ renderSettings: oculto })).toBe(false);
    expect(selectAvatarVisible({ renderSettings: initial() })).toBe(true);
    expect(selectAvatarVisible({ renderSettings: reducer(initial(), setAvatarRenderStyle('xray')) })).toBe(true);
  });
});
