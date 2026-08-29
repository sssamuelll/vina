import { safeGetItem, safeKey, safeStorageLength } from '../safeStorage';

/**
 * Entorno de la pestaña al momento de exportar el diagnóstico: navegador,
 * viewport, memoria del heap, WebGPU disponible, build servido y las
 * banderas de localStorage (`vina-*`, nunca blobs). Un solo `try/catch`
 * alrededor de todo: si algo lanza (navigator bloqueado, contexto raro) el
 * bundle sigue con `environment: {}` en vez de romper la exportación entera.
 *
 * Spec: docs/superpowers/specs/2026-08-29-caja-negra-bitacora-design.md § 4.
 */
export interface Environment {
  userAgent?: string;
  dpr?: number;
  viewport?: { w: number; h: number };
  hardwareConcurrency?: number;
  jsHeapUsedMB?: number;
  webgpu?: boolean;
  href?: string;
  build?: string;
  flags?: Record<string, string>;
}

const MAX_FLAG_VALUE_CHARS = 32;
const FLAG_PREFIX = 'vina-';
const BUILD_SCRIPT_MARKER = 'assets/index-';

/** `src` (atributo, no la URL resuelta) del primer `<script>` de build servido, o `undefined` en dev. */
function findBuild(): string | undefined {
  for (const script of Array.from(document.scripts)) {
    const src = script.getAttribute('src');
    if (src?.includes(BUILD_SCRIPT_MARKER)) return src;
  }
  return undefined;
}

/** Claves `vina-*` de localStorage con valor ≤ 32 caracteres — nunca blobs. */
function collectFlags(): Record<string, string> {
  const flags: Record<string, string> = {};
  const len = safeStorageLength();
  for (let i = 0; i < len; i++) {
    const key = safeKey(i);
    if (!key || !key.startsWith(FLAG_PREFIX)) continue;
    const value = safeGetItem(key);
    if (value === null || value.length > MAX_FLAG_VALUE_CHARS) continue;
    flags[key] = value;
  }
  return flags;
}

export function getEnvironment(): Environment {
  try {
    const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      userAgent: navigator.userAgent,
      dpr: window.devicePixelRatio,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      hardwareConcurrency: navigator.hardwareConcurrency,
      jsHeapUsedMB: memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : undefined,
      webgpu: 'gpu' in navigator,
      href: window.location.href,
      build: findBuild(),
      flags: collectFlags(),
    };
  } catch {
    return {};
  }
}
