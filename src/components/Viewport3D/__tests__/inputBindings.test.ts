import { describe, it, expect } from 'vitest';
import { isPanGesture, isPanRelease, cameraViewFromKeyEvent } from '../inputBindings';

describe('isPanGesture', () => {
  it('accepts middle-click (mouse pan, CLO3D-style)', () => {
    expect(isPanGesture({ button: 1, altKey: false })).toBe(true);
  });

  it('accepts Alt+left-click (trackpad fallback — no middle button on MacBook)', () => {
    expect(isPanGesture({ button: 0, altKey: true })).toBe(true);
  });

  it('rejects plain left-click (reserved for selection/tools)', () => {
    expect(isPanGesture({ button: 0, altKey: false })).toBe(false);
  });

  it('rejects right-click even with Alt (reserved for orbit + context menu)', () => {
    expect(isPanGesture({ button: 2, altKey: false })).toBe(false);
    expect(isPanGesture({ button: 2, altKey: true })).toBe(false);
  });

  it('accepts middle-click with Alt held (still a pan)', () => {
    expect(isPanGesture({ button: 1, altKey: true })).toBe(true);
  });
});

describe('isPanRelease', () => {
  it('ends pan on middle or left button release', () => {
    expect(isPanRelease(1)).toBe(true);
    expect(isPanRelease(0)).toBe(true);
  });

  it('ignores right button release', () => {
    expect(isPanRelease(2)).toBe(false);
  });
});

describe('cameraViewFromKeyEvent', () => {
  const noMods = { ctrlKey: false, metaKey: false, altKey: false };

  it('maps numpad codes to CLO3D-standard views', () => {
    expect(cameraViewFromKeyEvent({ code: 'Numpad2', ...noMods })).toBe('front');
    expect(cameraViewFromKeyEvent({ code: 'Numpad8', ...noMods })).toBe('back');
    expect(cameraViewFromKeyEvent({ code: 'Numpad4', ...noMods })).toBe('right');
    expect(cameraViewFromKeyEvent({ code: 'Numpad6', ...noMods })).toBe('left');
    expect(cameraViewFromKeyEvent({ code: 'Numpad5', ...noMods })).toBe('top');
    expect(cameraViewFromKeyEvent({ code: 'Numpad0', ...noMods })).toBe('bottom');
    expect(cameraViewFromKeyEvent({ code: 'Numpad1', ...noMods })).toBe('threeQuarterRight');
    expect(cameraViewFromKeyEvent({ code: 'Numpad3', ...noMods })).toBe('threeQuarterLeft');
  });

  it('maps top-row digit codes identically (MacBook has no numpad)', () => {
    expect(cameraViewFromKeyEvent({ code: 'Digit2', ...noMods })).toBe('front');
    expect(cameraViewFromKeyEvent({ code: 'Digit8', ...noMods })).toBe('back');
    expect(cameraViewFromKeyEvent({ code: 'Digit4', ...noMods })).toBe('right');
    expect(cameraViewFromKeyEvent({ code: 'Digit6', ...noMods })).toBe('left');
    expect(cameraViewFromKeyEvent({ code: 'Digit5', ...noMods })).toBe('top');
    expect(cameraViewFromKeyEvent({ code: 'Digit0', ...noMods })).toBe('bottom');
    expect(cameraViewFromKeyEvent({ code: 'Digit1', ...noMods })).toBe('threeQuarterRight');
    expect(cameraViewFromKeyEvent({ code: 'Digit3', ...noMods })).toBe('threeQuarterLeft');
  });

  it('returns null with Alt held (fitmap.* owns Alt+digits per defaults.ts)', () => {
    expect(cameraViewFromKeyEvent({ code: 'Digit6', ctrlKey: false, metaKey: false, altKey: true })).toBeNull();
    expect(cameraViewFromKeyEvent({ code: 'Numpad8', ctrlKey: false, metaKey: false, altKey: true })).toBeNull();
  });

  it('returns null with Ctrl/Meta held (browser/app chords)', () => {
    expect(cameraViewFromKeyEvent({ code: 'Digit2', ctrlKey: true, metaKey: false, altKey: false })).toBeNull();
    expect(cameraViewFromKeyEvent({ code: 'Digit2', ctrlKey: false, metaKey: true, altKey: false })).toBeNull();
  });

  it('returns null for unmapped keys', () => {
    expect(cameraViewFromKeyEvent({ code: 'Numpad7', ...noMods })).toBeNull();
    expect(cameraViewFromKeyEvent({ code: 'Digit7', ...noMods })).toBeNull();
    expect(cameraViewFromKeyEvent({ code: 'KeyA', ...noMods })).toBeNull();
  });
});
