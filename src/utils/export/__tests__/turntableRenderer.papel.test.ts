/**
 * @vitest-environment jsdom
 *
 * La vuelta 360° es un vídeo, y un vídeo no tiene canal alfa: con el fondo
 * «Papel» el lienzo del visor es transparente y cada cuadro saldría negro
 * (spec 2026-10-02 § 12). Cada cuadro lleva el papel debajo, siempre.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { renderTurntable } from '../turntableRenderer';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderTurntable sobre el papel', () => {
  it('cada cuadro pinta el papel y después el visor encima', async () => {
    const llamadas: string[] = [];
    const ctx = {
      set fillStyle(v: string) { llamadas.push(`fillStyle=${v}`); },
      fillRect: () => llamadas.push('fillRect'),
      drawImage: () => llamadas.push('drawImage'),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
    (HTMLCanvasElement.prototype as unknown as { captureStream: () => unknown }).captureStream = () => ({});
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (n: string) => (n === '--canvas-2d' ? '#faf4e3' : ''),
    } as unknown as CSSStyleDeclaration);

    class GrabadorFalso {
      static isTypeSupported() { return true; }
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {}
      stop() { this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', GrabadorFalso);

    const lienzo = document.createElement('canvas');
    lienzo.width = 8;
    lienzo.height = 8;
    const renderer = { domElement: lienzo, render: () => {} };
    const camara = new THREE.PerspectiveCamera();
    camara.position.set(0, 1, 3);

    await renderTurntable(renderer as never, new THREE.Scene(), camara, { frameCount: 2, direction: 'cw', fps: 1000 });

    expect(llamadas).toEqual([
      'fillStyle=#faf4e3', 'fillRect', 'drawImage',
      'fillStyle=#faf4e3', 'fillRect', 'drawImage',
    ]);
  });
});
