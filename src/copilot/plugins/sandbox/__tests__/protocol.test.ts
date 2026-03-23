import { describe, it, expect } from 'vitest';
import {
  isMainToWorkerMessage,
  isWorkerToMainMessage,
  PermissionDeniedError,
  TimeoutError,
  PluginCrashError,
} from '../protocol';

// ─── isMainToWorkerMessage ────────────────────────────────────────────────────

describe('isMainToWorkerMessage', () => {
  it('accepts load messages', () => {
    expect(isMainToWorkerMessage({ type: 'load', pluginCode: '', manifest: {}, apiVersion: 1 })).toBe(true);
  });

  it('accepts execute messages', () => {
    expect(isMainToWorkerMessage({ type: 'execute', requestId: 'r1', toolName: 'foo', params: {} })).toBe(true);
  });

  it('accepts capabilityResult messages', () => {
    expect(isMainToWorkerMessage({ type: 'capabilityResult', requestId: 'r2', data: null })).toBe(true);
  });

  it('accepts capabilityDenied messages', () => {
    expect(
      isMainToWorkerMessage({
        type: 'capabilityDenied',
        requestId: 'r3',
        permission: 'network',
        reason: 'not granted',
      }),
    ).toBe(true);
  });

  it('accepts terminate messages', () => {
    expect(isMainToWorkerMessage({ type: 'terminate' })).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isMainToWorkerMessage({ type: 'unknown' })).toBe(false);
  });

  it('rejects null', () => {
    expect(isMainToWorkerMessage(null)).toBe(false);
  });

  it('rejects non-object values', () => {
    expect(isMainToWorkerMessage('load')).toBe(false);
    expect(isMainToWorkerMessage(42)).toBe(false);
    expect(isMainToWorkerMessage(undefined)).toBe(false);
  });

  it('rejects objects without a type field', () => {
    expect(isMainToWorkerMessage({})).toBe(false);
    expect(isMainToWorkerMessage({ payload: 'foo' })).toBe(false);
  });

  it('rejects worker→main type names', () => {
    expect(isMainToWorkerMessage({ type: 'loaded' })).toBe(false);
    expect(isMainToWorkerMessage({ type: 'capability' })).toBe(false);
  });
});

// ─── isWorkerToMainMessage ────────────────────────────────────────────────────

describe('isWorkerToMainMessage', () => {
  it('accepts loaded messages', () => {
    expect(isWorkerToMainMessage({ type: 'loaded', tools: [] })).toBe(true);
  });

  it('accepts loadError messages', () => {
    expect(isWorkerToMainMessage({ type: 'loadError', error: 'oops' })).toBe(true);
  });

  it('accepts result messages', () => {
    expect(
      isWorkerToMainMessage({ type: 'result', requestId: 'r1', result: { success: true } }),
    ).toBe(true);
  });

  it('accepts error messages', () => {
    expect(isWorkerToMainMessage({ type: 'error', requestId: 'r2', error: 'boom' })).toBe(true);
  });

  it('accepts capability messages', () => {
    expect(
      isWorkerToMainMessage({ type: 'capability', requestId: 'r3', method: 'getPieces', args: [] }),
    ).toBe(true);
  });

  it('rejects an unknown type', () => {
    expect(isWorkerToMainMessage({ type: 'unknown' })).toBe(false);
  });

  it('rejects null', () => {
    expect(isWorkerToMainMessage(null)).toBe(false);
  });

  it('rejects non-object values', () => {
    expect(isWorkerToMainMessage('loaded')).toBe(false);
    expect(isWorkerToMainMessage(0)).toBe(false);
  });

  it('rejects objects without a type field', () => {
    expect(isWorkerToMainMessage({})).toBe(false);
  });

  it('rejects main→worker type names', () => {
    expect(isWorkerToMainMessage({ type: 'load' })).toBe(false);
    expect(isWorkerToMainMessage({ type: 'execute' })).toBe(false);
    expect(isWorkerToMainMessage({ type: 'terminate' })).toBe(false);
  });
});

// ─── Error classes ────────────────────────────────────────────────────────────

describe('PermissionDeniedError', () => {
  it('has the correct name', () => {
    const err = new PermissionDeniedError('network', 'fetch');
    expect(err.name).toBe('PermissionDeniedError');
  });

  it('stores permission and method fields', () => {
    const err = new PermissionDeniedError('network', 'fetch');
    expect(err.permission).toBe('network');
    expect(err.method).toBe('fetch');
  });

  it('is an instance of Error', () => {
    expect(new PermissionDeniedError('storage', 'get')).toBeInstanceOf(Error);
  });

  it('includes permission and method in the message', () => {
    const err = new PermissionDeniedError('export', 'exportDXF');
    expect(err.message).toContain('export');
    expect(err.message).toContain('exportDXF');
  });
});

describe('TimeoutError', () => {
  it('has the correct name', () => {
    const err = new TimeoutError('req-1', 30_000);
    expect(err.name).toBe('TimeoutError');
  });

  it('stores requestId and timeoutMs fields', () => {
    const err = new TimeoutError('req-1', 30_000);
    expect(err.requestId).toBe('req-1');
    expect(err.timeoutMs).toBe(30_000);
  });

  it('is an instance of Error', () => {
    expect(new TimeoutError('req-2', 60_000)).toBeInstanceOf(Error);
  });

  it('includes requestId and timeoutMs in the message', () => {
    const err = new TimeoutError('abc', 5000);
    expect(err.message).toContain('abc');
    expect(err.message).toContain('5000');
  });
});

describe('PluginCrashError', () => {
  it('has the correct name', () => {
    const err = new PluginCrashError('com.example.plugin', 'Worker terminated unexpectedly');
    expect(err.name).toBe('PluginCrashError');
  });

  it('stores the pluginId field', () => {
    const err = new PluginCrashError('com.example.plugin', 'Worker terminated unexpectedly');
    expect(err.pluginId).toBe('com.example.plugin');
  });

  it('is an instance of Error', () => {
    expect(new PluginCrashError('com.foo.bar', 'crash')).toBeInstanceOf(Error);
  });

  it('includes pluginId in the message', () => {
    const err = new PluginCrashError('com.openclo.test', 'syntax error');
    expect(err.message).toContain('com.openclo.test');
    expect(err.message).toContain('syntax error');
  });
});
