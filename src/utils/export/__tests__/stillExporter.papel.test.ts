/**
 * @vitest-environment jsdom
 *
 * Una imagen del 3D se exporta sobre el papel salvo que se pida transparente
 * (spec 2026-10-02 § 12, «las exportaciones del 3D»). Renderer, escena y cámara
 * son falsos —no hay GPU aquí— y el contexto 2D también: lo que se mide es el
 * orden en que se compone la imagen.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { exportStill } from '../stillExporter';

afterEach(() => vi.restoreAllMocks());

function montar() {
  const llamadas: string[] = [];
  const ctx = {
    set fillStyle(v: string) { llamadas.push(`fillStyle=${v}`); },
    fillRect: () => llamadas.push('fillRect'),
    drawImage: () => llamadas.push('drawImage'),
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => llamadas.push('putImageData'),
  };
  // `getContext` está sobrecargado (2D, WebGL, WebGPU): se tipa a mano.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ctx) as never);
  // Qué canvas se crearon y cuál se codificó: que el papel se pinte no basta,
  // lo que se descarga tiene que ser el que lo lleva.
  const creados: HTMLCanvasElement[] = [];
  const codificados: HTMLCanvasElement[] = [];
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const el = original(tag);
    if (tag === 'canvas') creados.push(el as HTMLCanvasElement);
    return el;
  }) as never);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback) {
    codificados.push(this);
    cb(new Blob(['x'], { type: 'image/png' }));
  } as never);
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (n: string) => (n === '--canvas-2d' ? '#faf4e3' : ''),
  } as unknown as CSSStyleDeclaration);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:falso';
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};

  const renderer = {
    getSize: (v: THREE.Vector2) => v.set(100, 100),
    getClearAlpha: () => 1,
    setClearAlpha: () => {},
    setRenderTarget: () => {},
    render: () => {},
    readRenderTargetPixelsAsync: async () => ({ buffer: new ArrayBuffer(4 * 4 * 4) }),
  };
  const camera = new THREE.PerspectiveCamera();
  return { llamadas, creados, codificados, renderer: renderer as never, scene: new THREE.Scene(), camera };
}

describe('exportStill sobre el papel', () => {
  it('sin pedir transparente, pinta el papel debajo y codifica ESE canvas', async () => {
    const { llamadas, creados, codificados, renderer, scene, camera } = montar();
    await exportStill(renderer, scene, camera, { width: 4, height: 4, transparent: false });
    expect(llamadas).toEqual(['putImageData', 'fillStyle=#faf4e3', 'fillRect', 'drawImage']);
    expect(creados).toHaveLength(2);
    expect(codificados).toEqual([creados[1]]);
  });

  it('pidiendo transparente, no toca el alfa: no hay papel y se codifica el canvas de la imagen', async () => {
    const { llamadas, creados, codificados, renderer, scene, camera } = montar();
    await exportStill(renderer, scene, camera, { width: 4, height: 4, transparent: true });
    expect(llamadas).toEqual(['putImageData']);
    expect(codificados).toEqual([creados[0]]);
  });

  it('en JPEG también va sobre el papel: sin él, lo transparente sale negro', async () => {
    const { llamadas, renderer, scene, camera } = montar();
    await exportStill(renderer, scene, camera, { width: 4, height: 4, format: 'jpeg' });
    expect(llamadas).toContain('fillRect');
  });
});
