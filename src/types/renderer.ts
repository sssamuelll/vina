/**
 * Widened renderer type for WebGL/WebGPU compatibility.
 *
 * THREE's common Renderer class is not re-exported from the main 'three'
 * barrel, so we define a structural interface covering the methods our
 * export utilities need.  Both WebGLRenderer and WebGPURenderer satisfy this.
 */
import type { Camera, Object3D, RenderTarget, Vector2 } from 'three';

export interface AnyRenderer {
  /** The underlying canvas element. */
  readonly domElement: HTMLCanvasElement;
  /** Render a scene from a camera's point of view. */
  render(scene: Object3D, camera: Camera): void;
  /** Get the current output canvas size. */
  getSize(target: Vector2): Vector2;
  /** Set the output canvas size. */
  setSize(width: number, height: number, updateStyle?: boolean): void;
  /** Direct rendering to a render target (null = default framebuffer). */
  setRenderTarget(renderTarget: RenderTarget | null): void;
  /** Read pixels from a render target into a typed array. */
  readRenderTargetPixels(
    renderTarget: RenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: ArrayBufferView,
  ): void;
  /** Get the current clear alpha value. */
  getClearAlpha(): number;
  /** Set the clear alpha value. */
  setClearAlpha(alpha: number): void;
}
