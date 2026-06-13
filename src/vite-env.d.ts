/// <reference types="vite/client" />
// WebGPU globals (GPUDevice, GPUBuffer, ...): @types/three >= 0.184 dropped its
// transitive @webgpu/types dependency (uses local empty stubs instead), so the
// repo's GPU code (src/utils/cloth/gpu/) needs the real types declared directly.
/// <reference types="@webgpu/types" />

declare const __BUILD_TIMESTAMP__: string;
