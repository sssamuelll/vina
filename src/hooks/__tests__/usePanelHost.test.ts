// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelHost } from '../usePanelHost';

describe('usePanelHost', () => {
  it('arranca con las dos ranuras vacías', () => {
    const { result } = renderHook(() => usePanelHost());
    expect(result.current.leftPanel).toBeNull();
    expect(result.current.rightPanel).toBeNull();
  });

  it('openPanel enruta un panel derecho a rightPanel', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('BOM'));
    expect(result.current.rightPanel).toBe('BOM');
    expect(result.current.leftPanel).toBeNull();
  });

  it('openPanel enruta un panel izquierdo a leftPanel', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    expect(result.current.leftPanel).toBe('Properties');
    expect(result.current.rightPanel).toBeNull();
  });

  it('openPanel nunca cierra: abrir el mismo panel dos veces lo deja abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.openPanel('Properties'));
    expect(result.current.leftPanel).toBe('Properties');
  });

  it('openPanel de un panel izquierdo no toca el derecho ya abierto — la esencia del caso medido', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Layers')); // derecho
    act(() => result.current.openPanel('Properties')); // izquierdo
    expect(result.current.rightPanel).toBe('Layers');
    expect(result.current.leftPanel).toBe('Properties');
  });

  it('togglePanel abre si estaba cerrado', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    expect(result.current.rightPanel).toBe('Avatar');
  });

  it('togglePanel cierra si era el mismo panel ya abierto de ese lado', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    act(() => result.current.togglePanel('Avatar'));
    expect(result.current.rightPanel).toBeNull();
  });

  it('togglePanel de un panel distinto en el mismo lado reemplaza al que estaba', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.togglePanel('Avatar'));
    act(() => result.current.togglePanel('BOM'));
    expect(result.current.rightPanel).toBe('BOM');
  });

  it('closePanel cierra si es el panel abierto de ese lado', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closePanel('Properties'));
    expect(result.current.leftPanel).toBeNull();
  });

  it('closePanel no hace nada si el panel nombrado no es el que está abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closePanel('Grading')); // mismo lado, otro panel
    expect(result.current.leftPanel).toBe('Properties');
  });
});
