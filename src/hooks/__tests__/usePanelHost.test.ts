// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePanelHost } from '../usePanelHost';
import { bajarLaEscalera } from '../../shortcuts/escaleraDeLoLlamado';

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

  // H-2: closeLeft/closeRight existen para que AppShell deje de pasarle a
  // ContextPanel una flecha en línea (`() => closePanel(leftPanel)`), que
  // cambia de identidad en cada render y re-suscribe el listener de Escape
  // — el mecanismo detrás de "Escape cierra siempre el izquierdo" con dos
  // paneles abiertos. Ver el comentario junto a su definición. (closePanel
  // por nombre se borró del hook — sin llamador desde que AppShell pasó a
  // closeLeft/closeRight; estos dos cubren lo que hoy se usa.)
  it('closeLeft cierra el panel izquierdo sin importar cuál esté abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties'));
    act(() => result.current.closeLeft());
    expect(result.current.leftPanel).toBeNull();
  });

  it('closeLeft no toca el panel derecho', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Layers')); // derecho
    act(() => result.current.closeLeft());
    expect(result.current.rightPanel).toBe('Layers');
  });

  it('closeRight cierra el panel derecho sin importar cuál esté abierto', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Layers'));
    act(() => result.current.closeRight());
    expect(result.current.rightPanel).toBeNull();
  });

  it('closeRight no toca el panel izquierdo', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => result.current.openPanel('Properties')); // izquierdo
    act(() => result.current.closeRight());
    expect(result.current.leftPanel).toBe('Properties');
  });

  it('closeLeft y closeRight mantienen la misma identidad entre renders — la esencia del arreglo', () => {
    const { result, rerender } = renderHook(() => usePanelHost());
    const closeLeftAntes = result.current.closeLeft;
    const closeRightAntes = result.current.closeRight;
    act(() => result.current.openPanel('Properties')); // fuerza un re-render
    rerender();
    expect(result.current.closeLeft).toBe(closeLeftAntes);
    expect(result.current.closeRight).toBe(closeRightAntes);
  });

  it('Escape con dos paneles abiertos cierra los dos: un solo peldaño, el de los paneles', () => {
    const { result } = renderHook(() => usePanelHost());
    act(() => { result.current.openPanel('Properties'); result.current.openPanel('Layers'); });
    expect([result.current.leftPanel, result.current.rightPanel]).toEqual(['Properties', 'Layers']);
    act(() => { expect(bajarLaEscalera()).toBe('paneles'); });
    expect([result.current.leftPanel, result.current.rightPanel]).toEqual([null, null]);
  });
});
