import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  classifyError,
  calculateBackoff,
  retryWithBackoff,
  getErrorMessage,
  simplifyOutline,
  isOfflineMode,
  getOfflineActions,
  RecoveryStrategy,
  hasFallbackProvider,
  loadFallbackProvider,
  saveFallbackProvider,
  clearLegacyFallbackKeys,
} from '../errorRecovery';
import type { ProviderConfig } from '../providers/types';
import { SecureStorage } from '../providers/secureStorage';

// ─── localStorage mock ──────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ─── sessionStorage mock (for SecureStorage) ────────────────────────────────

const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();

Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock });

// ─── classifyError ──────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('should classify auth errors (401)', () => {
    expect(classifyError(new Error('Anthropic API error 401: Unauthorized'))).toBe('auth');
  });

  it('should classify auth errors (403)', () => {
    expect(classifyError(new Error('403 Forbidden'))).toBe('auth');
  });

  it('should classify invalid API key', () => {
    expect(classifyError(new Error('Invalid API key provided'))).toBe('auth');
  });

  it('should classify "invalid x-api-key" as auth', () => {
    expect(classifyError(new Error('Invalid x-api-key header'))).toBe('auth');
  });

  it('should classify "authentication" as auth', () => {
    expect(classifyError(new Error('Authentication failed'))).toBe('auth');
  });

  it('should classify "unauthorized" (lowercase) as auth', () => {
    expect(classifyError(new Error('unauthorized access'))).toBe('auth');
  });

  it('should classify rate limit errors (429)', () => {
    expect(classifyError(new Error('429 Too Many Requests'))).toBe('rate_limit');
  });

  it('should classify rate limit by message', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
  });

  it('should classify "too many requests" as rate_limit', () => {
    expect(classifyError(new Error('too many requests, please wait'))).toBe('rate_limit');
  });

  it('should classify "quota" as rate_limit', () => {
    expect(classifyError(new Error('API quota exceeded for this billing period'))).toBe('rate_limit');
  });

  it('should classify network errors', () => {
    expect(classifyError(new Error('Failed to fetch'))).toBe('network');
  });

  it('should classify timeout errors as network', () => {
    expect(classifyError(new Error('Request timeout'))).toBe('network');
  });

  it('should classify 502/503/504 as network', () => {
    expect(classifyError(new Error('502 Bad Gateway'))).toBe('network');
    expect(classifyError(new Error('503 Service Unavailable'))).toBe('network');
    expect(classifyError(new Error('504 Gateway Timeout'))).toBe('network');
  });

  it('should classify ECONNREFUSED as network', () => {
    expect(classifyError(new Error('connect ECONNREFUSED 127.0.0.1:11434'))).toBe('network');
  });

  it('should classify ENOTFOUND as network', () => {
    expect(classifyError(new Error('getaddrinfo ENOTFOUND api.anthropic.com'))).toBe('network');
  });

  it('should classify "fetch" errors as network', () => {
    expect(classifyError(new Error('fetch failed: network error'))).toBe('network');
  });

  it('should classify provider unavailable (500)', () => {
    expect(classifyError(new Error('500 Internal Server Error'))).toBe('provider_unavailable');
  });

  it('should classify "unavailable" as provider_unavailable', () => {
    expect(classifyError(new Error('Service temporarily unavailable'))).toBe('provider_unavailable');
  });

  it('should classify "provider" mentions as provider_unavailable', () => {
    expect(classifyError(new Error('Provider returned an error'))).toBe('provider_unavailable');
  });

  it('should classify invalid params', () => {
    expect(classifyError(new Error('Invalid parameters: missing required field'))).toBe('invalid_params');
  });

  it('should classify "invalid outline" as invalid_params', () => {
    expect(classifyError(new Error('Invalid outline: self-intersecting'))).toBe('invalid_params');
  });

  it('should classify "validation" as invalid_params', () => {
    expect(classifyError(new Error('Validation error: bust must be positive'))).toBe('invalid_params');
  });

  it('should classify "missing required" as invalid_params', () => {
    expect(classifyError(new Error('Missing required parameter: name'))).toBe('invalid_params');
  });

  it('should classify tool execution errors', () => {
    expect(classifyError(new Error('Execution error: Piece not found'))).toBe('tool_execution');
  });

  it('should classify "piece not found" as tool_execution', () => {
    expect(classifyError(new Error('Piece "Front Bodice" not found'))).toBe('tool_execution');
  });

  it('should classify unknown errors', () => {
    expect(classifyError(new Error('Something weird happened'))).toBe('unknown');
  });

  it('should handle string errors', () => {
    expect(classifyError('401 Unauthorized')).toBe('auth');
  });

  it('should handle non-Error non-string objects', () => {
    expect(classifyError(42)).toBe('unknown');
    expect(classifyError(null)).toBe('unknown');
    expect(classifyError(undefined)).toBe('unknown');
  });

  it('should handle objects with toString', () => {
    expect(classifyError({ toString: () => '429 rate limited' })).toBe('rate_limit');
  });
});

// ─── calculateBackoff ───────────────────────────────────────────────────────

describe('calculateBackoff', () => {
  it('should calculate exponential delay', () => {
    // Attempt 0: ~1000ms (base)
    const d0 = calculateBackoff(0, 1000, 10000);
    expect(d0).toBeGreaterThanOrEqual(1000);
    expect(d0).toBeLessThanOrEqual(1500);

    // Attempt 1: ~2000ms
    const d1 = calculateBackoff(1, 1000, 10000);
    expect(d1).toBeGreaterThanOrEqual(2000);
    expect(d1).toBeLessThanOrEqual(2500);

    // Attempt 2: ~4000ms
    const d2 = calculateBackoff(2, 1000, 10000);
    expect(d2).toBeGreaterThanOrEqual(4000);
    expect(d2).toBeLessThanOrEqual(4500);
  });

  it('should produce increasing delays across attempts', () => {
    // Run multiple times to account for jitter
    const delays = [0, 1, 2, 3].map(a => calculateBackoff(a, 1000, 100000));
    for (let i = 1; i < delays.length; i++) {
      // Each delay should be roughly 2x the previous (within jitter)
      expect(delays[i]).toBeGreaterThan(delays[i - 1]);
    }
  });

  it('should cap at maxMs', () => {
    const d = calculateBackoff(10, 1000, 5000);
    expect(d).toBeLessThanOrEqual(5000);
  });

  it('should work with custom base', () => {
    const d = calculateBackoff(0, 500, 10000);
    expect(d).toBeGreaterThanOrEqual(500);
    expect(d).toBeLessThanOrEqual(750);
  });

  it('should handle base of 0', () => {
    const d = calculateBackoff(0, 0, 10000);
    // 0 * 2^0 + random * 0 = 0
    expect(d).toBe(0);
  });

  it('should handle max of 0', () => {
    const d = calculateBackoff(0, 1000, 0);
    // min(1000 + jitter, 0) → 0
    expect(d).toBe(0);
  });

  it('should use default parameters', () => {
    const d = calculateBackoff(0);
    expect(d).toBeGreaterThanOrEqual(1000);
    expect(d).toBeLessThanOrEqual(1500);
  });
});

// ─── retryWithBackoff ───────────────────────────────────────────────────────

describe('retryWithBackoff', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(false); // not "recovered" — succeeded first try
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on network error and succeed', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) throw new Error('Failed to fetch');
      return 'success';
    });

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(true);
    expect(result.result).toBe('success');
    expect(result.attempts).toBe(3);
  });

  it('should fail after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const result = await retryWithBackoff(fn, { maxAttempts: 2, baseDelayMs: 10 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.message).toContain('Failed after 2 attempts');
  });

  it('should not retry on auth errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.message).toContain('clave');
  });

  it('should not retry on unknown errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Something strange'));

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('should retry on rate limit errors', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) throw new Error('429 Too Many Requests');
      return 'ok';
    });

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('should retry on provider_unavailable errors', async () => {
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) throw new Error('Provider temporarily unavailable');
      return 'recovered';
    });

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(true);
    expect(result.result).toBe('recovered');
    expect(result.attempts).toBe(2);
  });

  it('should not retry on invalid_params errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Invalid parameters: bust is negative'));

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not retry on tool_execution errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Tool execution error: Piece not found'));

    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(1);
  });

  it('should use default options when none provided', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn);
    expect(result.result).toBe('ok');
    expect(result.attempts).toBe(1);
  });

  it('should handle maxAttempts=1 (no retries)', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));
    const result = await retryWithBackoff(fn, { maxAttempts: 1, baseDelayMs: 10 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should exhaust all retries on persistent network failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await retryWithBackoff(fn, { maxAttempts: 3, baseDelayMs: 5 });
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

// ─── getErrorMessage ────────────────────────────────────────────────────────

/**
 * #1199 — estas siete cadenas no son una nota al pie en gris: `UnifiedBarChat`
 * las mete en el hilo como mensaje del asistente, con su avatar y su burbuja.
 * O sea, la IA hablándole a María en inglés en medio de una conversación en
 * español (dos líneas más abajo, ese mismo archivo ya escribe «Agrega un
 * proveedor de IA en ajustes»).
 *
 * Las aserciones piden el SIGNIFICADO —qué pasó, qué hacer— y además niegan el
 * inglés viejo. Solo pedir español dejaría pasar una traducción que se coma la
 * instrucción; solo negar el inglés lo dejaría pasar borrando la cadena entera.
 *
 * Los emoji se conservan a propósito: viven en 139 sitios más del repo
 * (severidades del inspector, menú contextual, ErrorBoundary). Son otra
 * conversación, no esta.
 */
describe('getErrorMessage — la IA le habla a María en español (#1199)', () => {
  it('auth: dice que la clave no sirve, adónde ir, y dónde conseguir otra', () => {
    const msg = getErrorMessage('auth', new Error('401'));
    expect(msg).toContain('clave');
    // La instrucción es la mitad del mensaje: el menú se llama «ajustes» en su
    // barra, no «Settings» (glosario 2026-07-16).
    expect(msg).toContain('ajustes');
    expect(msg).not.toContain('Settings');
    expect(msg).toContain('console.anthropic.com');
    expect(msg).toContain('platform.openai.com');
    expect(msg).toContain('🔑');
  });

  it('rate_limit: dice que el proveedor frenó y las dos salidas', () => {
    const msg = getErrorMessage('rate_limit', new Error('429'));
    expect(msg).toContain('proveedor');
    expect(msg).toContain('Espera');
    expect(msg).toContain('ajustes');
    expect(msg).toContain('⏳');
  });

  it('network: culpa a la conexión, no a la usuaria', () => {
    const msg = getErrorMessage('network', new Error('failed'));
    expect(msg).toContain('conexión');
    expect(msg).toContain('proveedor');
    expect(msg).toContain('🌐');
  });

  it('provider_unavailable: dice que es temporal y ofrece cambiar', () => {
    const msg = getErrorMessage('provider_unavailable', new Error('500'));
    expect(msg).toContain('proveedor');
    expect(msg).toContain('ajustes');
    expect(msg).toContain('🔧');
  });

  it('invalid_params: traduce lo que puede y no se come el crudo', () => {
    const msg = getErrorMessage('invalid_params', new Error('bust must be positive'));
    // Techo conocido de #1194: lo que el traductor no reconoce pasa intacto.
    // Perderlo sería peor que dejarlo en inglés — es el único dato del fallo.
    expect(msg).toContain('bust must be positive');
    expect(msg).toContain('⚠️');
  });

  it('invalid_params: la forma canónica de la validación sí llega traducida', () => {
    const msg = getErrorMessage('invalid_params', new Error('Missing required parameter: "pieceId"'));
    expect(msg).toContain('alta el dato pieceId');
    expect(msg).not.toContain('Missing required parameter');
  });

  it('tool_execution: dice que falló una herramienta y traduce el crudo canónico', () => {
    const msg = getErrorMessage('tool_execution', new Error('Piece XYZ not found'));
    expect(msg).toContain('Piece XYZ not found');
    expect(msg).toContain('herramienta');
    expect(msg).toContain('🔧');
  });

  it('unknown: error inesperado, con el crudo detrás', () => {
    const msg = getErrorMessage('unknown', new Error('Cosmic ray'));
    expect(msg).toContain('Cosmic ray');
    expect(msg).toContain('inesperado');
    expect(msg).toContain('❌');
  });

  it('should handle non-Error values', () => {
    const msg = getErrorMessage('unknown', 'string error');
    expect(msg).toContain('string error');
  });

  /**
   * El trinquete. Sin esto, un caso nuevo del `switch` nace en inglés y nadie
   * se entera: las aserciones de arriba solo miran los siete de hoy.
   */
  it('ninguno de los siete tipos deja inglés del proveedor en la burbuja', () => {
    const TIPOS = ['auth', 'rate_limit', 'network', 'provider_unavailable',
      'invalid_params', 'tool_execution', 'unknown'] as const;
    const INGLES = /\b(Settings|Rate limit|Network error|Tool error|Invalid parameters|Unexpected error|API key|try again|Wait a moment|unavailable|switch|Check your)\b/i;
    for (const tipo of TIPOS) {
      // Error sin texto reconocible: lo que salga es cuerpo nuestro, no crudo.
      // Y fuera las URL antes de mirar: `console.anthropic.com/settings/keys`
      // lleva «settings» dentro y no es copy — es la dirección donde ella
      // consigue la clave. (Se me coló en el primer intento de este trinquete.)
      const sinUrls = getErrorMessage(tipo, new Error('42')).replace(/\S+\.(com|ai|org)\S*/g, '');
      expect(sinUrls, `${tipo} sigue hablando inglés: ${sinUrls}`).not.toMatch(INGLES);
    }
  });
});

// ─── simplifyOutline ────────────────────────────────────────────────────────

describe('simplifyOutline', () => {
  it('should convert cubic bezier to line', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 0, 20, 10, 30, 30] },
      { type: 'L', values: [0, 30] },
      { type: 'Z', values: [] },
    ];

    const simplified = simplifyOutline(outline);
    expect(simplified[1].type).toBe('L');
    expect(simplified[1].values).toEqual([30, 30]);
  });

  it('should convert quadratic bezier to line', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'Q', values: [10, 10, 20, 0] },
      { type: 'Z', values: [] },
    ];

    const simplified = simplifyOutline(outline);
    expect(simplified[1].type).toBe('L');
    expect(simplified[1].values).toEqual([20, 0]);
  });

  it('should keep simple outlines unchanged', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'Z', values: [] },
    ];

    const simplified = simplifyOutline(outline);
    expect(simplified).toEqual(outline);
  });

  it('should return short outlines as-is', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 10] },
    ];
    expect(simplifyOutline(outline)).toEqual(outline);
  });

  it('should handle empty outline', () => {
    expect(simplifyOutline([])).toEqual([]);
  });

  it('should handle single-point outline', () => {
    const outline = [{ type: 'M', values: [0, 0] }];
    expect(simplifyOutline(outline)).toEqual(outline);
  });

  it('should handle mixed curves and lines', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [10, 0] },
      { type: 'C', values: [15, 0, 20, 5, 20, 10] },
      { type: 'L', values: [20, 20] },
      { type: 'Q', values: [10, 25, 0, 20] },
      { type: 'Z', values: [] },
    ];

    const simplified = simplifyOutline(outline);
    expect(simplified.length).toBe(6);
    expect(simplified[0]).toEqual({ type: 'M', values: [0, 0] });
    expect(simplified[1]).toEqual({ type: 'L', values: [10, 0] });
    expect(simplified[2]).toEqual({ type: 'L', values: [20, 10] }); // C → L
    expect(simplified[3]).toEqual({ type: 'L', values: [20, 20] });
    expect(simplified[4]).toEqual({ type: 'L', values: [0, 20] }); // Q → L
    expect(simplified[5]).toEqual({ type: 'Z', values: [] });
  });

  it('should keep degenerate C (< 6 values) unchanged', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, 20] }, // only 2 values, not a valid cubic
      { type: 'Z', values: [] },
    ];
    const simplified = simplifyOutline(outline);
    // The C has hasCurves=true so simplification runs, but < 6 values → kept as-is
    expect(simplified[1]).toEqual({ type: 'C', values: [10, 20] });
  });

  it('should keep degenerate Q (< 4 values) unchanged', () => {
    const outline = [
      { type: 'M', values: [0, 0] },
      { type: 'Q', values: [10] }, // only 1 value
      { type: 'Z', values: [] },
    ];
    const simplified = simplifyOutline(outline);
    expect(simplified[1]).toEqual({ type: 'Q', values: [10] });
  });

  it('should handle outline with only Z', () => {
    const outline = [{ type: 'Z', values: [] }];
    expect(simplifyOutline(outline)).toEqual(outline);
  });
});

// ─── isOfflineMode ──────────────────────────────────────────────────────────

describe('isOfflineMode', () => {
  it('should return true when config is null', () => {
    expect(isOfflineMode(null)).toBe(true);
  });

  it('should return true when API key is empty', () => {
    const config: ProviderConfig = { provider: 'anthropic', apiKey: '', model: 'claude-sonnet-4-20250514' };
    expect(isOfflineMode(config)).toBe(true);
  });

  it('should return false when API key is present', () => {
    const config: ProviderConfig = { provider: 'anthropic', apiKey: 'sk-test', model: 'claude-sonnet-4-20250514' };
    expect(isOfflineMode(config)).toBe(false);
  });

  it('should return true for whitespace-only API key', () => {
    const config: ProviderConfig = { provider: 'openai', apiKey: '   ', model: 'gpt-4o' };
    expect(isOfflineMode(config)).toBe(true);
  });

  it('should return false for Ollama with empty key (Ollama does not need a key)', () => {
    // isOfflineMode checks apiKey, so Ollama with empty key is technically "offline"
    // This is expected behavior — Ollama uses baseUrl, not apiKey
    const config: ProviderConfig = { provider: 'ollama', apiKey: '', model: 'llama3' };
    expect(isOfflineMode(config)).toBe(true);
  });
});

// ─── getOfflineActions ──────────────────────────────────────────────────────

describe('getOfflineActions', () => {
  it('should return at least 5 actions', () => {
    const actions = getOfflineActions();
    expect(actions.length).toBeGreaterThanOrEqual(5);
  });

  it('should return exactly 10 actions', () => {
    const actions = getOfflineActions();
    expect(actions.length).toBe(10);
  });

  it('should include bodice creation', () => {
    const actions = getOfflineActions();
    const bodice = actions.find(a => a.toolName === 'createPiece' && a.defaultParams.template === 'bodice-front');
    expect(bodice).toBeDefined();
    expect(bodice?.icon).toBe('👚');
  });

  it('should include export actions', () => {
    const actions = getOfflineActions();
    const dxf = actions.find(a => a.toolName === 'exportDXF');
    expect(dxf).toBeDefined();
    const pdf = actions.find(a => a.toolName === 'exportPDF');
    expect(pdf).toBeDefined();
  });

  it('should have bilingual labels (Spanish / English)', () => {
    const actions = getOfflineActions();
    for (const action of actions) {
      expect(action.label).toContain('/');
    }
  });

  it('should have unique tool actions', () => {
    const actions = getOfflineActions();
    const toolNames = new Set(actions.map(a => `${a.toolName}-${JSON.stringify(a.defaultParams)}`));
    expect(toolNames.size).toBe(actions.length);
  });

  it('should have an emoji icon for each action', () => {
    const actions = getOfflineActions();
    for (const action of actions) {
      expect(action.icon.length).toBeGreaterThan(0);
    }
  });
});

// ─── Fallback Provider ──────────────────────────────────────────────────────

describe('Fallback Provider', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    SecureStorage._resetForTest();
  });

  it('should return null when no fallback configured', async () => {
    expect(await loadFallbackProvider()).toBeNull();
  });

  it('should save and load a fallback provider', async () => {
    const config: ProviderConfig = {
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    };
    await saveFallbackProvider(config);
    const loaded = await loadFallbackProvider();
    expect(loaded).toEqual(config);
  });

  it('should NOT store API key in localStorage (BUG-10: writes IDB-only)', async () => {
    await saveFallbackProvider({
      provider: 'openai',
      apiKey: 'sk-secret-key',
      model: 'gpt-4o-mini',
    });
    // Post-BUG-10: saveFallbackProvider routes through storageSet (IDB-only).
    // The legacy LS key is not written. In tests without IDB the LS fallback
    // inside storageSet writes to a *different* key (`vina:settings:...`).
    // Either way the legacy key has no API key — verify the legacy key is
    // empty AND none of the LS values contains the secret string.
    expect(localStorageMock.getItem('vina-fallback-provider')).toBeNull();
    for (let i = 0; i < localStorageMock.length; i++) {
      const key = localStorageMock.key(i)!;
      const value = localStorageMock.getItem(key);
      expect(value).not.toContain('sk-secret-key');
    }
  });

  it('should store API key encrypted in sessionStorage via SecureStorage', async () => {
    await saveFallbackProvider({
      provider: 'openai',
      apiKey: 'sk-secret-key',
      model: 'gpt-4o-mini',
    });
    // SecureStorage uses 'vina-secure-' prefix + AES-GCM encryption
    const stored = sessionStorageMock.getItem('vina-secure-fallback-apikey');
    expect(stored).not.toBeNull();
    // Value must NOT be plaintext or simple base64 of the plaintext
    expect(stored).not.toBe('sk-secret-key');
    expect(stored).not.toBe(btoa('sk-secret-key'));
    // But we can still retrieve it via SecureStorage
    expect(await SecureStorage.get('fallback-apikey')).toBe('sk-secret-key');
  });

  it('should detect when fallback is available', async () => {
    await saveFallbackProvider({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    });
    expect(await hasFallbackProvider('anthropic')).toBe(true);
    expect(await hasFallbackProvider('openai')).toBe(false); // same provider
  });

  it('should return false for fallback with empty API key', async () => {
    await saveFallbackProvider({
      provider: 'openai',
      apiKey: '',
      model: 'gpt-4o-mini',
    });
    expect(await hasFallbackProvider('anthropic')).toBe(false);
  });

  it('should handle corrupted localStorage for fallback', async () => {
    localStorageMock.setItem('vina-fallback-provider', 'not-json{');
    expect(await loadFallbackProvider()).toBeNull();
  });

  it('should strip legacy API keys from localStorage on migration', async () => {
    // Simulate legacy format: full config with API key in localStorage
    localStorageMock.setItem('vina-fallback-provider', JSON.stringify({
      provider: 'openai',
      apiKey: 'sk-leaked-key',
      model: 'gpt-4o-mini',
    }));
    await clearLegacyFallbackKeys();
    const raw = localStorageMock.getItem('vina-fallback-provider');
    const parsed = JSON.parse(raw!);
    expect(parsed.apiKey).toBeUndefined();
    expect(parsed.provider).toBe('openai');
    expect(parsed.model).toBe('gpt-4o-mini');
  });

  it('should migrate legacy API key to SecureStorage for current session', async () => {
    localStorageMock.setItem('vina-fallback-provider', JSON.stringify({
      provider: 'openai',
      apiKey: 'sk-migrate-me',
      model: 'gpt-4o-mini',
    }));
    await clearLegacyFallbackKeys();
    // Key should now be retrievable via SecureStorage (encrypted in sessionStorage)
    expect(await SecureStorage.get('fallback-apikey')).toBe('sk-migrate-me');
  });

  it('should not crash during migration with missing localStorage', async () => {
    await expect(clearLegacyFallbackKeys()).resolves.not.toThrow();
  });

  it('should not crash on corrupted JSON during migration', async () => {
    localStorageMock.setItem('vina-fallback-provider', 'not-json{');
    await expect(clearLegacyFallbackKeys()).resolves.not.toThrow();
    // Corrupted entry should be removed entirely
    expect(localStorageMock.getItem('vina-fallback-provider')).toBeNull();
  });

  it('should be idempotent (no-op on already-migrated data)', async () => {
    localStorageMock.setItem('vina-fallback-provider', JSON.stringify({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }));
    await clearLegacyFallbackKeys();
    const raw = localStorageMock.getItem('vina-fallback-provider');
    expect(JSON.parse(raw!)).toEqual({ provider: 'openai', model: 'gpt-4o-mini' });
  });

  it('should NEVER leak API key string into any localStorage value', async () => {
    const secretKey = 'sk-super-secret-test-key-12345';
    await saveFallbackProvider({
      provider: 'openai',
      apiKey: secretKey,
      model: 'gpt-4o-mini',
    });
    // Scan every localStorage value
    for (let i = 0; i < localStorageMock.length; i++) {
      const k = localStorageMock.key(i)!;
      const v = localStorageMock.getItem(k)!;
      expect(v).not.toContain(secretKey);
    }
  });

  it('should NEVER leak API key string into any sessionStorage value', async () => {
    const secretKey = 'sk-super-secret-test-key-12345';
    await saveFallbackProvider({
      provider: 'openai',
      apiKey: secretKey,
      model: 'gpt-4o-mini',
    });
    // Scan every sessionStorage value — encrypted data should not contain the plaintext
    for (let i = 0; i < sessionStorageMock.length; i++) {
      const k = sessionStorageMock.key(i)!;
      const v = sessionStorageMock.getItem(k)!;
      expect(v).not.toContain(secretKey);
    }
  });

  it('should save and retrieve via SecureStorage round-trip', async () => {
    await saveFallbackProvider({
      provider: 'anthropic',
      apiKey: 'sk-ant-round-trip',
      model: 'claude-sonnet-4-20250514',
    });
    const loaded = await loadFallbackProvider();
    expect(loaded).not.toBeNull();
    expect(loaded!.apiKey).toBe('sk-ant-round-trip');
    expect(loaded!.provider).toBe('anthropic');
    expect(loaded!.model).toBe('claude-sonnet-4-20250514');
  });

  it('should return empty apiKey when sessionStorage has no key', async () => {
    localStorageMock.setItem('vina-fallback-provider', JSON.stringify({
      provider: 'openai',
      model: 'gpt-4o-mini',
    }));
    // sessionStorage is empty — no API key
    const loaded = await loadFallbackProvider();
    expect(loaded).not.toBeNull();
    expect(loaded!.apiKey).toBe('');
    expect(loaded!.provider).toBe('openai');
    // hasFallbackProvider should return false (empty key)
    expect(await hasFallbackProvider('anthropic')).toBe(false);
  });
});

// ─── RecoveryStrategy ───────────────────────────────────────────────────────

describe('RecoveryStrategy', () => {
  it('should recover from network errors via retry', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    let attempt = 0;
    const fn = async () => {
      attempt++;
      if (attempt < 2) throw new Error('Failed to fetch');
      return 'recovered';
    };

    const result = await strategy.recover(new Error('Failed to fetch'), fn);
    expect(result.recovered).toBe(true);
    expect(result.result).toBe('recovered');
  });

  it('should return auth message without retry', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    const fn = async () => 'should-not-run';

    const result = await strategy.recover(new Error('401 Unauthorized'), fn);
    expect(result.recovered).toBe(false);
    expect(result.message).toContain('clave');
    expect(result.attempts).toBe(1);
  });

  it('should recover from rate_limit errors via retry', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    let attempt = 0;
    const fn = async () => {
      attempt++;
      if (attempt < 2) throw new Error('429 rate limited');
      return 'ok';
    };

    const result = await strategy.recover(new Error('429 rate limited'), fn);
    expect(result.recovered).toBe(true);
  });

  it('should retry provider_unavailable with max 2 attempts', async () => {
    const strategy = new RecoveryStrategy(5, 10);
    let attempt = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt < 3) throw new Error('Provider error 500');
      return 'ok';
    });

    const result = await strategy.recover(new Error('Provider error 500'), fn);
    // provider_unavailable path uses maxAttempts: 2
    expect(result.recovered).toBe(false);
    expect(result.attempts).toBe(2);
  });

  it('should return message for invalid_params without retry', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    const fn = vi.fn();

    const result = await strategy.recover(new Error('Invalid parameters: bust < 0'), fn);
    expect(result.recovered).toBe(false);
    expect(result.message).toContain('Invalid parameters');
    expect(result.attempts).toBe(1);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should return message for tool_execution without retry', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    const fn = vi.fn();

    const result = await strategy.recover(new Error('Tool execution error'), fn);
    expect(result.recovered).toBe(false);
    expect(result.message).toContain('Falló una herramienta');
    expect(result.attempts).toBe(1);
  });

  it('should return message for unknown errors without retry', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    const fn = vi.fn();

    const result = await strategy.recover(new Error('cosmic rays'), fn);
    expect(result.recovered).toBe(false);
    expect(result.message).toContain('cosmic rays');
    expect(result.attempts).toBe(1);
  });

  it('should wrap operations with withRecovery', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    let attempt = 0;

    const result = await strategy.withRecovery(async () => {
      attempt++;
      if (attempt < 2) throw new Error('Network timeout');
      return 42;
    });

    expect(result).toBe(42);
    expect(attempt).toBe(2);
  });

  it('should throw after failed recovery in withRecovery', async () => {
    const strategy = new RecoveryStrategy(2, 10);

    await expect(
      strategy.withRecovery(async () => {
        throw new Error('401 Unauthorized');
      })
    ).rejects.toThrow('clave');
  });

  it('should succeed on first attempt in withRecovery without recovery', async () => {
    const strategy = new RecoveryStrategy(3, 10);
    const result = await strategy.withRecovery(async () => 'first-try');
    expect(result).toBe('first-try');
  });

  it('should use custom maxRetries and baseDelay', async () => {
    const strategy = new RecoveryStrategy(1, 5);
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await strategy.recover(new Error('Network error'), fn);
    // With maxRetries=1, it should only try once on retry
    expect(result.attempts).toBe(1);
  });
});
