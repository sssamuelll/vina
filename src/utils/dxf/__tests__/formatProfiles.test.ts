import { describe, it, expect } from 'vitest';
import { FORMAT_PROFILES, getProfile } from '../formatProfiles';

describe('formatProfiles', () => {
  it('has all 5 format profiles', () => {
    expect(Object.keys(FORMAT_PROFILES)).toHaveLength(5);
    expect(FORMAT_PROFILES.aama).toBeDefined();
    expect(FORMAT_PROFILES.astm).toBeDefined();
    expect(FORMAT_PROFILES.gerber).toBeDefined();
    expect(FORMAT_PROFILES.lectra).toBeDefined();
    expect(FORMAT_PROFILES.standard).toBeDefined();
  });

  it('getProfile returns the correct profile', () => {
    expect(getProfile('aama').id).toBe('aama');
    expect(getProfile('gerber').name).toContain('Gerber');
  });

  describe('AAMA profile', () => {
    it('maps numeric layer 1 to cut', () => { expect(FORMAT_PROFILES.aama.layerMap['1']).toBe('cut'); });
    it('maps CUT to cut', () => { expect(FORMAT_PROFILES.aama.layerMap['CUT']).toBe('cut'); });
    it('maps numeric layer 4 to notch', () => { expect(FORMAT_PROFILES.aama.layerMap['4']).toBe('notch'); });
    it('maps numeric layer 7 to grainline', () => { expect(FORMAT_PROFILES.aama.layerMap['7']).toBe('grainline'); });
  });

  describe('ASTM profile', () => {
    it('maps PIECE BOUNDARY to cut', () => { expect(FORMAT_PROFILES.astm.layerMap['PIECE BOUNDARY']).toBe('cut'); });
    it('maps SEW LINE to seam', () => { expect(FORMAT_PROFILES.astm.layerMap['SEW LINE']).toBe('seam'); });
  });

  describe('Gerber profile', () => {
    it('maps PERIMETER to cut', () => { expect(FORMAT_PROFILES.gerber.layerMap['PERIMETER']).toBe('cut'); });
    it('maps TURN POINTS to notch', () => { expect(FORMAT_PROFILES.gerber.layerMap['TURN POINTS']).toBe('notch'); });
    it('has a detectHook', () => { expect(FORMAT_PROFILES.gerber.detectHook).toBeDefined(); });
  });

  describe('Lectra profile', () => {
    it('maps CONTOUR to cut', () => { expect(FORMAT_PROFILES.lectra.layerMap['CONTOUR']).toBe('cut'); });
    it('maps DROIT_FIL to grainline', () => { expect(FORMAT_PROFILES.lectra.layerMap['DROIT_FIL']).toBe('grainline'); });
    it('maps CRAN to notch', () => { expect(FORMAT_PROFILES.lectra.layerMap['CRAN']).toBe('notch'); });
  });

  describe('Standard profile', () => {
    it('has empty layerMap', () => { expect(Object.keys(FORMAT_PROFILES.standard.layerMap)).toHaveLength(0); });
  });
});
