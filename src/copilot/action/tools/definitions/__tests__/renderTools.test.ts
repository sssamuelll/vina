import { describe, it, expect, vi } from 'vitest';
import type { RootState, AppDispatch } from '../../../../../store';

function mockState(overrides?: Partial<{
  resolutionPreset: string;
  exportWidth: number;
  exportHeight: number;
  surfaceMode3D: string;
  avatarRenderStyle: string;
  imageFormat: string;
  jpegQuality: number;
  videoFormat: string;
  videoFps: number;
  samplesPerPixel: number;
  denoiserEnabled: boolean;
  lights: unknown[];
}>): () => RootState {
  return () => ({
    renderSettings: {
      resolutionPreset: overrides?.resolutionPreset ?? 'custom',
      exportWidth: overrides?.exportWidth ?? 2048,
      exportHeight: overrides?.exportHeight ?? 2048,
      avatarRenderStyle: overrides?.avatarRenderStyle ?? 'visible',
      imageFormat: overrides?.imageFormat ?? 'png',
      jpegQuality: overrides?.jpegQuality ?? 0.92,
      videoFormat: overrides?.videoFormat ?? 'webm',
      videoFps: overrides?.videoFps ?? 30,
      samplesPerPixel: overrides?.samplesPerPixel ?? 1,
      denoiserEnabled: overrides?.denoiserEnabled ?? false,
      lights: overrides?.lights ?? [],
    },
    simulation: {
      surfaceMode3D: overrides?.surfaceMode3D ?? 'textured',
    },
  }) as unknown as RootState;
}

describe('render copilot tools', () => {
  it('setRenderResolution with preset dispatches setResolutionPreset', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderResolution')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ preset: '1080p' }, dispatch, mockState());
    expect(result.success).toBe(true);
    expect(dispatch).toHaveBeenCalled();
    expect(result.data).toHaveProperty('preset', '1080p');
  });

  it('setRenderResolution with custom dimensions dispatches width/height', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderResolution')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ width: 1920, height: 1080 }, dispatch, mockState());
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('preset', 'custom');
  });

  it('setRenderResolution with no params returns error', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderResolution')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({}, dispatch, mockState());
    expect(result.success).toBe(false);
  });

  it('setRenderResolution rollback restores previous custom preset', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderResolution')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ preset: '4k' }, dispatch, mockState({ resolutionPreset: 'custom', exportWidth: 800, exportHeight: 600 }));
    expect(result.rollback).toBeDefined();
    result.rollback!();
    expect(dispatch).toHaveBeenCalled();
  });

  it('setGarmentDisplayMode dispatches setSurfaceMode3D', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setGarmentDisplayMode')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ mode: 'xray' }, dispatch, mockState());
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ mode: 'xray' });
  });

  it('setAvatarRenderStyle dispatches and provides rollback', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setAvatarRenderStyle')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ style: 'hidden' }, dispatch, mockState());
    expect(result.success).toBe(true);
    result.rollback!();
  });

  it('setLightingPreset dispatches applyLightPreset', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setLightingPreset')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ preset: 'natural' }, dispatch, mockState());
    expect(result.success).toBe(true);
  });

  it('setImageFormat dispatches format and optional quality', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setImageFormat')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    // With quality
    const r1 = await tool.execute({ format: 'jpeg', jpegQuality: 0.8 }, dispatch, mockState());
    expect(r1.success).toBe(true);
    expect(r1.data).toHaveProperty('jpegQuality', 0.8);
    // Without quality
    const r2 = await tool.execute({ format: 'png' }, dispatch, mockState());
    expect(r2.success).toBe(true);
    r2.rollback!();
  });

  it('setVideoFormat dispatches format and optional fps', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setVideoFormat')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    // With fps
    const r1 = await tool.execute({ format: 'mp4', fps: 60 }, dispatch, mockState());
    expect(r1.success).toBe(true);
    expect(r1.data).toHaveProperty('fps', 60);
    // Without fps
    const r2 = await tool.execute({ format: 'webm' }, dispatch, mockState());
    expect(r2.success).toBe(true);
    r2.rollback!();
  });

  it('setRenderQuality dispatches samples and denoiser', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderQuality')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ samplesPerPixel: 16, denoiserEnabled: true }, dispatch, mockState());
    expect(result.success).toBe(true);
    result.rollback!();
  });

  it('setRenderQuality with no params returns error', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderQuality')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({}, dispatch, mockState());
    expect(result.success).toBe(false);
  });

  it('setRenderQuality with only denoiser', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderQuality')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ denoiserEnabled: false }, dispatch, mockState());
    expect(result.success).toBe(true);
  });

  it('setRenderQuality with only samples', async () => {
    const { tools } = await import('../renderTools');
    const tool = tools.find(t => t.name === 'setRenderQuality')!;
    const dispatch = vi.fn() as unknown as AppDispatch;
    const result = await tool.execute({ samplesPerPixel: 4 }, dispatch, mockState());
    expect(result.success).toBe(true);
  });
});
