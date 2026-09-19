/**
 * Error Recovery — clasifica el fallo y lo dice en palabras que la usuaria puede
 * usar.
 *
 * Lo que de verdad corre hoy son dos funciones, y las dos las llama
 * `UnifiedBarChat`: `classifyError` mira la cadena cruda del proveedor y decide
 * de qué tipo es el fallo; `getErrorMessage` lo convierte en el mensaje que la
 * IA pinta en la burbuja (#1199).
 *
 * Esta cabecera anunciaba cinco estrategias de recuperación automática
 * —backoff exponencial, reintento con parámetros simplificados, cascada a otro
 * proveedor, modo sin conexión— y **ninguna tenía consumidor**. El backoff y la
 * clase `RecoveryStrategy` se borraron aquí; lo que queda de esa familia
 * (`simplifyOutline`, el trío de `*FallbackProvider`, `isOfflineMode` y
 * `getOfflineActions`) está inventariado en el PR que borró el resto. Si algún
 * día se cablea de verdad, que el texto lo diga entonces y no antes.
 *
 * @module errorRecovery
 */

import type { ProviderConfig } from './providers/types';
import { SecureStorage } from './providers/secureStorage';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/safeStorage';
import { mensajeDeErrorEs } from './action/tools/mensajeDeErrorEs';

// ─── Error Classification ───────────────────────────────────────────────────

/** Classified error type for recovery strategy selection */
export type ErrorType =
  | 'network'
  | 'auth'
  | 'rate_limit'
  | 'invalid_params'
  | 'provider_unavailable'
  | 'tool_execution'
  | 'unknown';

/**
 * Classify an error into a recovery-actionable type.
 *
 * Examines error messages, status codes, and error types to determine
 * the appropriate recovery strategy.
 *
 * @param error - The error to classify
 * @returns Classified error type
 */
export function classifyError(error: unknown): ErrorType {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Auth errors — API key invalid or missing
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid api key') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('authentication')
  ) {
    return 'auth';
  }

  // Rate limit
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('quota')
  ) {
    return 'rate_limit';
  }

  // Network errors
  if (
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('timeout') ||
    lower.includes('failed to fetch') ||
    lower.includes('503') ||
    lower.includes('502') ||
    lower.includes('504')
  ) {
    return 'network';
  }

  // Provider unavailable
  if (
    lower.includes('provider') ||
    lower.includes('unavailable') ||
    lower.includes('500')
  ) {
    return 'provider_unavailable';
  }

  // Invalid parameters (tool-level)
  if (
    lower.includes('invalid param') ||
    lower.includes('invalid outline') ||
    lower.includes('validation') ||
    lower.includes('missing required')
  ) {
    return 'invalid_params';
  }

  // Tool execution errors
  if (
    lower.includes('execution error') ||
    lower.includes('tool') ||
    lower.includes('piece') ||
    lower.includes('not found')
  ) {
    return 'tool_execution';
  }

  return 'unknown';
}

/**
 * Get a human-readable error message with actionable instructions.
 *
 * El texto sale en español (#1199): esto no es una nota al pie en gris, es lo
 * que `UnifiedBarChat` mete en el hilo como mensaje del asistente, con avatar y
 * burbuja. Los emoji se quedan — son otra conversación (139 sitios más).
 *
 * Se traduce al LEER, igual que `mensajeDeErrorEs` (#1194): `classifyError` ya
 * corrió sobre el error crudo antes de llegar aquí, así que traducir el cuerpo
 * no reclasifica nada. El crudo del proveedor que el traductor no reconoce pasa
 * intacto — es el único dato del fallo y perderlo sería peor que el inglés.
 *
 * @param errorType - Classified error type
 * @param error - Original error
 * @returns User-facing error message
 */
export function getErrorMessage(errorType: ErrorType, error: unknown): string {
  // Avoid double-wrapping already-formatted errors
  if (error instanceof Error && (error as Error & { _formatted?: boolean })._formatted) {
    return error.message;
  }
  const rawMsg = error instanceof Error ? (error.message || error.constructor.name) : String(error);

  switch (errorType) {
    case 'auth':
      return '🔑 La clave de la API no sirve o se venció. Cámbiala en ajustes (⚙️). ' +
        'Consigue una en: Anthropic → console.anthropic.com/settings/keys | OpenAI → platform.openai.com/api-keys';

    case 'rate_limit':
      return '⏳ El proveedor está frenando las respuestas por venir muy seguidas. ' +
        'Espera un momento y vuelve a intentar, o cambia de modelo o de proveedor en ajustes.';

    case 'network':
      return '🌐 No se pudo llegar al proveedor de IA. Revisa tu conexión a internet y vuelve a intentar.';

    case 'provider_unavailable':
      return '🔧 El proveedor de IA está caído por ahora. Vuelve a intentar en un momento, o cambia de proveedor en ajustes.';

    // Sin rótulo delante: `mensajeDeErrorEs` ya devuelve una frase entera
    // («Falta el dato pieceId»), y «Datos inválidos: falta el dato…» lo dice
    // dos veces. Cuando el traductor no reconoce el crudo, ese crudo es el
    // único dato que hay — igual que lo era en la versión inglesa.
    case 'invalid_params':
      return `⚠️ ${mensajeDeErrorEs(rawMsg)}. La IA va a intentar con valores más simples.`;

    case 'tool_execution':
      return `🔧 Falló una herramienta. ${mensajeDeErrorEs(rawMsg)}`;

    case 'unknown':
    default:
      return `❌ Error inesperado: ${rawMsg}`;
  }
}

// ─── Tool Recovery ──────────────────────────────────────────────────────────

/**
 * Simplify an outline by reducing control points for retry after outline validation failure.
 *
 * Converts complex curves to line segments and reduces point count,
 * creating a simpler outline that's more likely to validate.
 *
 * @param outline - The original outline that failed validation
 * @returns Simplified outline array
 */
export function simplifyOutline(
  outline: Array<{ type: string; values: number[] }>,
): Array<{ type: string; values: number[] }> {
  // Only simplify if there are curves to simplify
  const hasCurves = outline.some(cmd => cmd.type === 'C' || cmd.type === 'Q');
  if (!hasCurves) return outline;

  const simplified: Array<{ type: string; values: number[] }> = [];

  for (const cmd of outline) {
    if (cmd.type === 'C' && cmd.values.length >= 6) {
      // Convert cubic bezier to a line to its endpoint
      simplified.push({
        type: 'L',
        values: [cmd.values[4], cmd.values[5]],
      });
    } else if (cmd.type === 'Q' && cmd.values.length >= 4) {
      // Convert quadratic bezier to a line to its endpoint
      simplified.push({
        type: 'L',
        values: [cmd.values[2], cmd.values[3]],
      });
    } else {
      simplified.push(cmd);
    }
  }

  return simplified;
}

// ─── Provider Fallback ──────────────────────────────────────────────────────

/**
 * localStorage key for fallback provider configuration.
 * After migration, contains non-secret fields only (provider, model, baseUrl).
 * Note: the legacy format used this same key but stored the full config including
 * the API key. clearLegacyFallbackKeys() strips the apiKey field from any existing
 * entry at this key and migrates it to SecureStorage for the current session.
 */
const FALLBACK_PROVIDER_KEY = 'vina-fallback-provider';
/** SecureStorage key for fallback provider API key */
const FALLBACK_APIKEY_SECURE_KEY = 'fallback-apikey';

/**
 * Strip any API key from the fallback provider config in localStorage and IndexedDB.
 * Re-saves the config without the apiKey field. Migrates the key to SecureStorage
 * for the current session so the user doesn't lose their fallback immediately.
 *
 * Idempotent — safe to call on every startup. No-ops if no apiKey field exists.
 * Call once on app startup to migrate away from insecure storage.
 */
export async function clearLegacyFallbackKeys(): Promise<void> {
  // Clean localStorage
  const saved = safeGetItem(FALLBACK_PROVIDER_KEY);
  if (!saved) return;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(saved);
  } catch (parseErr) {
    // Corrupted data — remove the entire key to be safe (may contain a key in raw text)
    console.warn('[Security] Failed to parse legacy fallback config, removing entire key:', parseErr);
    safeRemoveItem(FALLBACK_PROVIDER_KEY);
    return;
  }

  if (parsed && typeof parsed.apiKey === 'string' && parsed.apiKey.length > 0) {
    // Migrate API key to SecureStorage for the current session (encrypted)
    const stored = await SecureStorage.set(FALLBACK_APIKEY_SECURE_KEY, parsed.apiKey as string);
    if (!stored) {
      // Encryption failed — keep the key in localStorage rather than losing it
      console.warn('[Security] Could not encrypt legacy API key; leaving it in localStorage for now');
      return;
    }
    // Re-save without the API key (safe — SecureStorage has the encrypted copy)
     
    const { apiKey: _removed, ...rest } = parsed;
    safeSetItem(FALLBACK_PROVIDER_KEY, JSON.stringify(rest));
    console.info('[Security] Migrated legacy API key from localStorage to SecureStorage');
  }

  // Clean IndexedDB (async, fire-and-forget but with logging)
  import("../utils/storage").then(async ({ storageGet, storageSet }) => {
    try {
      const idbConfig = await storageGet("settings", "fallback-provider");
      if (idbConfig && typeof idbConfig === 'object' && 'apiKey' in idbConfig) {
         
        const { apiKey: _removed, ...rest } = idbConfig as Record<string, unknown>;
        await storageSet("settings", "fallback-provider", rest);
        console.info('[Security] Cleared legacy API key from IndexedDB');
      }
    } catch (err) {
      console.warn('[Security] Failed to clean IndexedDB fallback provider entry:', err);
    }
  }).catch((err) => {
    console.warn('[Security] Failed to load storage module for IndexedDB cleanup:', err);
  });
}

/**
 * Load a fallback provider configuration.
 * Non-secret config from IDB canonical (BUG-10) with read-side migration from
 * legacy LS; API key from SecureStorage (sessionStorage).
 *
 * Note: after the browser tab is closed, the API key is lost (sessionStorage is
 * ephemeral). The user must re-enter it each session for fallback to be available.
 *
 * @returns Fallback provider config, or null if not configured
 */
export async function loadFallbackProvider(): Promise<ProviderConfig | null> {
  try {
    const { storageGet, migrateFromLocalStorage } = await import('../utils/storage');
    let stored = await storageGet<{ provider: string; model?: string; baseUrl?: string }>(
      'settings',
      'fallback-provider',
    );
    if (!stored) {
      stored = (await migrateFromLocalStorage<{ provider: string; model?: string; baseUrl?: string }>(
        FALLBACK_PROVIDER_KEY,
        'settings',
        'fallback-provider',
      )) ?? undefined;
    }
    if (!stored) return null;
    const apiKey = (await SecureStorage.get(FALLBACK_APIKEY_SECURE_KEY)) ?? '';
    return {
      provider: stored.provider as ProviderConfig['provider'],
      model: stored.model ?? '',
      baseUrl: stored.baseUrl,
      apiKey,
    };
  } catch (err) {
    console.warn('[errorRecovery] Failed to load fallback provider config:', err);
  }
  return null;
}

/**
 * Save a fallback provider configuration.
 * API key goes to SecureStorage (sessionStorage, cleared on tab close);
 * non-secret config to IDB canonical (BUG-10).
 *
 * @param config - Fallback provider configuration
 */
export async function saveFallbackProvider(config: ProviderConfig): Promise<void> {
  // Store API key in SecureStorage (AES-GCM encrypted, sessionStorage)
  const stored = await SecureStorage.set(FALLBACK_APIKEY_SECURE_KEY, config.apiKey);
  if (!stored) {
    console.warn('[errorRecovery] API key could not be stored securely; fallback provider may not work after page refresh');
  }
  // Store non-secret config in IDB canonical (BUG-10).
  const storedConfig = {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
  };
  const { storageSet } = await import('../utils/storage');
  await storageSet('settings', 'fallback-provider', storedConfig);
}

/**
 * Check whether an alternate provider is available for fallback.
 *
 * @param currentProvider - The provider that just failed
 * @returns Whether a fallback provider is configured
 */
export async function hasFallbackProvider(currentProvider: string): Promise<boolean> {
  const fallback = await loadFallbackProvider();
  if (!fallback) return false;
  return fallback.provider !== currentProvider && fallback.apiKey.length > 0;
}

// ─── Offline Mode ───────────────────────────────────────────────────────────

/**
 * Check if the agent is in offline mode (no API key configured).
 *
 * In offline mode, tools are still available via direct UI interaction
 * (command palette style), but no LLM is used for natural language processing.
 *
 * @param config - Current provider configuration
 * @returns Whether the agent is in offline mode
 */
export function isOfflineMode(config: ProviderConfig | null): boolean {
  if (!config) return true;
  return !config.apiKey || config.apiKey.trim().length === 0;
}

/**
 * Quick actions available in offline mode.
 * These map directly to tool calls without requiring LLM interpretation.
 */
export interface OfflineAction {
  /** Display label (bilingual) */
  label: string;
  /** Tool name to execute */
  toolName: string;
  /** Default parameters */
  defaultParams: Record<string, unknown>;
  /** Icon emoji */
  icon: string;
}

/**
 * Get the list of available offline quick actions.
 *
 * @returns Array of offline actions that can be executed without an LLM
 */
export function getOfflineActions(): OfflineAction[] {
  return [
    { label: 'Crear corpiño / Create bodice', toolName: 'createPiece', defaultParams: { template: 'bodice-front', name: 'Bodice Front' }, icon: '👚' },
    { label: 'Crear manga / Create sleeve', toolName: 'createPiece', defaultParams: { template: 'sleeve', name: 'Sleeve' }, icon: '🦾' },
    { label: 'Crear falda / Create skirt', toolName: 'createPiece', defaultParams: { template: 'skirt-front', name: 'Skirt Front' }, icon: '👗' },
    { label: 'Crear pantalón / Create pants', toolName: 'createPiece', defaultParams: { template: 'pants-front', name: 'Pants Front' }, icon: '👖' },
    { label: 'Crear cuello / Create collar', toolName: 'createPiece', defaultParams: { template: 'collar', name: 'Collar' }, icon: '👔' },
    { label: 'Exportar DXF / Export DXF', toolName: 'exportDXF', defaultParams: {}, icon: '📄' },
    { label: 'Exportar PDF / Export PDF', toolName: 'exportPDF', defaultParams: {}, icon: '📄' },
    { label: 'Anidar / Nest pieces', toolName: 'runNesting', defaultParams: {}, icon: '🧵' },
    { label: 'Ver medidas / Get measurements', toolName: 'getMeasurements', defaultParams: {}, icon: '📏' },
    { label: 'Listar telas / List fabrics', toolName: 'listFabrics', defaultParams: {}, icon: '🧶' },
  ];
}
