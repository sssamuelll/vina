/**
 * Plugin Worker Entry Point
 *
 * Runs inside a dedicated Web Worker per plugin.
 * Applies global lockdown, loads plugin code via Blob URL,
 * and routes messages between the plugin and the main thread bridge.
 */

// ─── Pre-lockdown captures ──────────────────────────────────────────────────
const _URL = URL;
const _Blob = Blob;

// ─── Global Lockdown ────────────────────────────────────────────────────────
const BLOCKED_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'importScripts', 'WebSocket', 'EventSource',
  'indexedDB', 'BroadcastChannel', 'caches',
  'Blob', 'URL',
  'WebAssembly',
  // Block dynamic code construction
  'eval',
  'SharedArrayBuffer',
  // Block Function constructor to prevent reconstruction of blocked globals
  'Function',
];

const lockdownFailures: string[] = [];
for (const name of BLOCKED_GLOBALS) {
  try {
    Object.defineProperty(self, name, {
      value: undefined, writable: false, configurable: false,
    });
  } catch {
    lockdownFailures.push(name);
  }
}

// Override setTimeout/setInterval to reject string arguments (eval-equivalent)
const _setTimeout = setTimeout;
const _setInterval = setInterval;
// @ts-expect-error — overriding global with stricter signature
self.setTimeout = (handler: unknown, ...args: unknown[]) => {
  if (typeof handler === 'string') throw new Error('setTimeout with string argument is blocked');
  return _setTimeout(handler as TimerHandler, ...(args as [number?]));
};
// @ts-expect-error — overriding global with stricter signature
self.setInterval = (handler: unknown, ...args: unknown[]) => {
  if (typeof handler === 'string') throw new Error('setInterval with string argument is blocked');
  return _setInterval(handler as TimerHandler, ...(args as [number?]));
};

// Freeze prototype chain
try {
  const proto = Object.getPrototypeOf(self);
  for (const name of BLOCKED_GLOBALS) {
    if (name in proto) {
      try {
        Object.defineProperty(proto, name, {
          value: undefined, writable: false, configurable: false,
        });
      } catch {
        lockdownFailures.push(`proto.${name}`);
      }
    }
  }
} catch {
  lockdownFailures.push('proto-chain');
}

if (lockdownFailures.length > 0) {
  console.warn(
    '[PluginSandbox] Failed to lock down globals:',
    lockdownFailures.join(', '),
    '— defense-in-depth layer incomplete',
  );
}

// ─── State ──────────────────────────────────────────────────────────────────
import { PluginContext } from './PluginContext';
import type {
  MainToWorkerMessage, LoadMessage, ExecuteMessage,
  ToolSchema,
} from './protocol';

const pluginTools: Map<string, {
  handler: (...args: unknown[]) => unknown;
  requiredPermissions: string[];
  schema: ToolSchema;
}> = new Map();
let apiVersion = 1;
let context: PluginContext | null = null;

// ─── Global Error Handler ───────────────────────────────────────────────────
self.onerror = (event) => {
  self.postMessage({
    type: 'error',
    requestId: '__global__',
    error: `Unhandled Worker error: ${event instanceof ErrorEvent ? event.message : String(event)}`,
  });
};

// ─── Message Handler ────────────────────────────────────────────────────────
self.onmessage = async (event: MessageEvent<MainToWorkerMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case 'load':
      await handleLoad(msg);
      break;
    case 'execute':
      await handleExecute(msg);
      break;
    case 'capabilityResult':
    case 'capabilityDenied':
      context?.handleResponse(msg);
      break;
    case 'terminate':
      context?.destroy();
      self.close();
      break;
  }
};

async function handleLoad(msg: LoadMessage): Promise<void> {
  try {
    apiVersion = msg.apiVersion ?? 1;

    // Security: scan for dynamic import() which can bypass fetch lockdown
    const FORBIDDEN_PATTERNS = [
      /\bimport\s*\(/,     // dynamic import()
      /\bimport\s*\.\s*meta/, // import.meta access
    ];
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(msg.pluginCode)) {
        self.postMessage({
          type: 'loadError',
          error: `Plugin code contains forbidden pattern: ${pattern.source}. Dynamic import() is not allowed in sandboxed plugins.`,
        });
        return;
      }
    }

    const blob = new _Blob([msg.pluginCode], { type: 'application/javascript' });
    const blobUrl = _URL.createObjectURL(blob);

    let mod: Record<string, unknown>;
    try {
      mod = await import(/* @vite-ignore */ blobUrl) as Record<string, unknown>;
    } finally {
      _URL.revokeObjectURL(blobUrl);
    }

    const pluginExport = mod.default as Record<string, unknown> | undefined;
    if (!pluginExport || !Array.isArray(pluginExport['tools'])) {
      self.postMessage({ type: 'loadError', error: 'Plugin must export default with tools array' });
      return;
    }

    const tools: ToolSchema[] = [];
    for (const rawTool of pluginExport['tools'] as Record<string, unknown>[]) {
      if (!rawTool['name'] || !rawTool['handler']) {
        console.warn(`[PluginSandbox] Skipping tool at index ${tools.length}: missing 'name' or 'handler'`);
        continue;
      }
      const schema: ToolSchema = {
        name: rawTool['name'] as string,
        description: (rawTool['description'] as string) || '',
        parameters: (rawTool['parameters'] as ToolSchema['parameters']) || { type: 'object', properties: {} },
        requiredPermissions: (rawTool['requiredPermissions'] as ToolSchema['requiredPermissions']) || [],
      };
      pluginTools.set(rawTool['name'] as string, {
        handler: rawTool['handler'] as (...args: unknown[]) => unknown,
        requiredPermissions: (rawTool['requiredPermissions'] as ToolSchema['requiredPermissions']) || [],
        schema,
      });
      tools.push(schema);
    }

    self.postMessage({ type: 'loaded', tools });
  } catch (err) {
    self.postMessage({ type: 'loadError', error: err instanceof Error ? err.message : String(err) });
  }
}

async function handleExecute(msg: ExecuteMessage): Promise<void> {
  const { requestId, toolName, params } = msg;
  const tool = pluginTools.get(toolName);

  if (!tool) {
    self.postMessage({ type: 'error', requestId, error: `Tool "${toolName}" not found` });
    return;
  }

  // Create fresh context per execution
  context = new PluginContext((capMsg) => self.postMessage(capMsg));

  try {
    let result;
    if (apiVersion >= 2) {
      result = await tool.handler(params, context);
    } else {
      // Legacy: no context passed
      result = await tool.handler(params);
    }
    self.postMessage({ type: 'result', requestId, result: result ?? { success: true } });
  } catch (err) {
    self.postMessage({ type: 'error', requestId, error: err instanceof Error ? err.message : String(err) });
  } finally {
    context.destroy();
    context = null;
  }
}
