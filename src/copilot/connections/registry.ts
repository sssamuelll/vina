/**
 * Provider registry — single source of truth for per-provider UI
 * metadata. The form components and dropdowns read from this; there
 * are NO more `if (provider === 'anthropic')` chains in the UI layer.
 *
 * To add a new provider:
 *   1. Append to `ProviderConfig['provider']` union in `providers/types.ts`.
 *   2. Add an entry here.
 *   3. Implement the provider in `providers/<name>.ts`.
 *   4. Wire into `UnifiedBarChat.getProvider()`.
 *
 * That's the whole surface — no UI code changes for new providers.
 *
 * @module connections/registry
 */

import type { ProviderId, ProviderMetadata } from './types';

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderMetadata> = {
  'vercel-gateway': {
    id: 'vercel-gateway',
    label: 'Vercel AI Gateway',
    defaultLabel: 'Vercel Gateway',
    defaultModel: 'anthropic/claude-sonnet-4.6',
    models: [
      'anthropic/claude-sonnet-4.6',
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-opus-4.7',
      'anthropic/claude-opus-4.6',
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4-flash',
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'openai/o4-mini',
      'meta/llama-3.3-70b',
    ],
    helpUrl: 'https://vercel.com/account/ai/keys',
    apiKey: { placeholder: 'vck_...', required: true },
    baseUrl: null,
    hint: 'Una clave, varios proveedores (Anthropic, OpenAI, DeepSeek, Meta, ...).',
  },

  anthropic: {
    id: 'anthropic',
    label: 'Anthropic (API)',
    defaultLabel: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: [
      'claude-sonnet-4-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-haiku-20241022',
    ],
    helpUrl: 'https://console.anthropic.com/settings/keys',
    apiKey: { placeholder: 'sk-ant-...', required: true },
    baseUrl: null,
  },

  openai: {
    id: 'openai',
    label: 'OpenAI (API)',
    defaultLabel: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo'],
    helpUrl: 'https://platform.openai.com/api-keys',
    apiKey: { placeholder: 'sk-...', required: true },
    baseUrl: null,
  },

  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek (API)',
    defaultLabel: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    // v4-flash + v4-pro are the canonical IDs.
    // deepseek-chat / deepseek-reasoner deprecate 2026-07-24.
    models: [
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'deepseek-chat',
      'deepseek-reasoner',
    ],
    helpUrl: 'https://platform.deepseek.com/api_keys',
    apiKey: { placeholder: 'sk-...', required: true },
    baseUrl: null,
  },

  ollama: {
    id: 'ollama',
    label: 'Ollama (Local)',
    defaultLabel: 'Ollama',
    defaultModel: 'llama3',
    models: ['llama3', 'codellama', 'mistral', 'mixtral'],
    helpUrl: null,
    apiKey: null,
    baseUrl: {
      label: 'URL de Ollama',
      placeholder: 'http://localhost:11434',
      defaultValue: 'http://localhost:11434',
      required: true,
    },
    hint: 'Ejecuta un modelo local con la CLI de Ollama antes de conectar.',
  },

  'claude-bridge': {
    id: 'claude-bridge',
    label: 'Claude Code (Bridge)',
    defaultLabel: 'Claude Bridge',
    defaultModel: 'claude-code',
    models: ['claude-code'],
    helpUrl: null,
    apiKey: null,
    baseUrl: {
      label: 'URL del bridge',
      placeholder: 'http://localhost:3200',
      defaultValue: 'http://localhost:3200',
      required: false,
    },
    hint: 'Usa tu sesión OAuth de Claude Code mediante el servidor bridge local. Ejecuta: node server/claude-bridge.mjs',
  },
};

/** All providers as an ordered list for dropdowns and pickers. */
export const PROVIDER_LIST: readonly ProviderMetadata[] = [
  PROVIDER_REGISTRY['vercel-gateway'],
  PROVIDER_REGISTRY.anthropic,
  PROVIDER_REGISTRY.openai,
  PROVIDER_REGISTRY.deepseek,
  PROVIDER_REGISTRY.ollama,
  PROVIDER_REGISTRY['claude-bridge'],
];
