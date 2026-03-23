import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { PluginContext } from '../PluginContext';
import { PermissionDeniedError, TimeoutError, CAPABILITY_TIMEOUT_MS } from '../protocol';
import type { CapabilityResultMessage, CapabilityDeniedMessage } from '../protocol';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type PostMessageMock = Mock<(msg: unknown) => void>;

/** Returns the requestId from the most recent call on the mock. */
function lastRequestId(spy: PostMessageMock): string {
  const calls = spy.mock.calls;
  const last = calls[calls.length - 1][0] as { requestId: string };
  return last.requestId;
}

/**
 * Extract the requestId from the most recent postMessage call and inject a
 * `capabilityResult` response into the context.
 */
function resolveLastRequest(ctx: PluginContext, spy: PostMessageMock, data: unknown): void {
  const msg: CapabilityResultMessage = {
    type: 'capabilityResult',
    requestId: lastRequestId(spy),
    data,
  };
  ctx.handleResponse(msg);
}

/**
 * Inject a `capabilityDenied` response for the most recent postMessage call.
 */
function denyLastRequest(
  ctx: PluginContext,
  spy: PostMessageMock,
  permission: string,
  reason: string,
): void {
  const msg: CapabilityDeniedMessage = {
    type: 'capabilityDenied',
    requestId: lastRequestId(spy),
    permission,
    reason,
  };
  ctx.handleResponse(msg);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PluginContext', () => {
  let postMessage: PostMessageMock;
  let ctx: PluginContext;

  beforeEach(() => {
    postMessage = vi.fn<(msg: unknown) => void>();
    ctx = new PluginContext(postMessage);
  });

  afterEach(() => {
    ctx.destroy();
  });

  // ─── readPieces ──────────────────────────────────────────────────────────

  describe('readPieces()', () => {
    it('sends a capability message with default limit=50 and offset=0', async () => {
      const promise = ctx.readPieces();
      resolveLastRequest(ctx, postMessage, { pieces: [], total: 0 });
      await promise;

      expect(postMessage).toHaveBeenCalledOnce();
      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('capability');
      expect(msg.method).toBe('readPieces');
      expect(msg.args).toMatchObject({ limit: 50, offset: 0 });
      expect(msg.requestId).toBeTypeOf('string');
    });

    it('forwards custom ids, limit, and offset', async () => {
      const promise = ctx.readPieces({ ids: ['a', 'b'], limit: 10, offset: 5 });
      resolveLastRequest(ctx, postMessage, { pieces: [], total: 0 });
      await promise;

      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.args).toMatchObject({ ids: ['a', 'b'], limit: 10, offset: 5 });
    });
  });

  // ─── readPiece ───────────────────────────────────────────────────────────

  describe('readPiece()', () => {
    it('sends correct capability message for readPiece', async () => {
      const promise = ctx.readPiece('p1');
      resolveLastRequest(ctx, postMessage, { id: 'p1' });
      await promise;

      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('capability');
      expect(msg.method).toBe('readPiece');
      expect(msg.args).toMatchObject({ id: 'p1' });
    });
  });

  // ─── updatePiece ─────────────────────────────────────────────────────────

  describe('updatePiece()', () => {
    it('sends correct capability message for updatePiece', async () => {
      const piece = { id: 'p1', name: 'Front' };
      const promise = ctx.updatePiece(piece);
      resolveLastRequest(ctx, postMessage, undefined);
      await promise;

      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('capability');
      expect(msg.method).toBe('updatePiece');
      expect(msg.args).toMatchObject({ piece });
    });
  });

  // ─── fetch ───────────────────────────────────────────────────────────────

  describe('fetch()', () => {
    it('sends correct capability message for fetch', async () => {
      const url = 'https://example.com/api';
      const options = { method: 'GET' };
      const promise = ctx.fetch(url, options);
      resolveLastRequest(ctx, postMessage, { status: 200, body: 'ok' });
      await promise;

      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('capability');
      expect(msg.method).toBe('fetch');
      expect(msg.args).toMatchObject({ url, options });
    });
  });

  // ─── getStorage ──────────────────────────────────────────────────────────

  describe('getStorage()', () => {
    it('sends correct capability message and returns .value from result', async () => {
      const promise = ctx.getStorage('my-key');
      resolveLastRequest(ctx, postMessage, { value: 'stored-value' });
      const result = await promise;

      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('capability');
      expect(msg.method).toBe('getStorage');
      expect(msg.args).toMatchObject({ key: 'my-key' });
      expect(result).toBe('stored-value');
    });

    it('returns null when value is null', async () => {
      const promise = ctx.getStorage('missing-key');
      resolveLastRequest(ctx, postMessage, { value: null });
      const result = await promise;
      expect(result).toBeNull();
    });
  });

  // ─── setStorage ──────────────────────────────────────────────────────────

  describe('setStorage()', () => {
    it('sends correct capability message for setStorage', async () => {
      const promise = ctx.setStorage('my-key', 'my-value');
      resolveLastRequest(ctx, postMessage, undefined);
      await promise;

      const msg = postMessage.mock.calls[0][0] as Record<string, unknown>;
      expect(msg.type).toBe('capability');
      expect(msg.method).toBe('setStorage');
      expect(msg.args).toMatchObject({ key: 'my-key', value: 'my-value' });
    });
  });

  // ─── handleResponse → resolve ────────────────────────────────────────────

  describe('handleResponse() with capabilityResult', () => {
    it('resolves the pending promise with the returned data', async () => {
      const promise = ctx.readMeasurements();
      const data = { chest: 96 };
      resolveLastRequest(ctx, postMessage, data);
      const result = await promise;
      expect(result).toEqual(data);
    });

    it('silently ignores unknown requestIds', () => {
      const msg: CapabilityResultMessage = {
        type: 'capabilityResult',
        requestId: 'non-existent',
        data: null,
      };
      expect(() => ctx.handleResponse(msg)).not.toThrow();
    });
  });

  // ─── handleResponse → reject (capabilityDenied) ──────────────────────────

  describe('handleResponse() with capabilityDenied', () => {
    it('rejects the pending promise with PermissionDeniedError', async () => {
      const promise = ctx.fetch('https://example.com');
      denyLastRequest(ctx, postMessage, 'network', 'network permission not granted');

      await expect(promise).rejects.toBeInstanceOf(PermissionDeniedError);
    });

    it('PermissionDeniedError carries the denied permission', async () => {
      const promise = ctx.fetch('https://example.com');
      denyLastRequest(ctx, postMessage, 'network', 'not allowed');

      const err = (await promise.catch((e: unknown) => e)) as PermissionDeniedError;
      expect(err.permission).toBe('network');
    });
  });

  // ─── Timeout ─────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('rejects with TimeoutError when no response arrives within CAPABILITY_TIMEOUT_MS', async () => {
      vi.useFakeTimers();

      const promise = ctx.readPieces();
      vi.advanceTimersByTime(CAPABILITY_TIMEOUT_MS + 1);

      await expect(promise).rejects.toBeInstanceOf(TimeoutError);

      vi.useRealTimers();
    });

    it('TimeoutError carries the requestId', async () => {
      vi.useFakeTimers();

      const promise = ctx.readPieces();
      const sentRequestId = lastRequestId(postMessage);
      vi.advanceTimersByTime(CAPABILITY_TIMEOUT_MS + 1);

      const err = (await promise.catch((e: unknown) => e)) as TimeoutError;
      expect(err.requestId).toBe(sentRequestId);
      expect(err.timeoutMs).toBe(CAPABILITY_TIMEOUT_MS);

      vi.useRealTimers();
    });
  });

  // ─── destroy ─────────────────────────────────────────────────────────────

  describe('destroy()', () => {
    it('rejects all pending requests with "PluginContext destroyed"', async () => {
      // Start several concurrent requests without resolving them
      const p1 = ctx.readPiece('a');
      const p2 = ctx.readPiece('b');
      const p3 = ctx.readMeasurements();

      ctx.destroy();

      await expect(p1).rejects.toThrow('PluginContext destroyed');
      await expect(p2).rejects.toThrow('PluginContext destroyed');
      await expect(p3).rejects.toThrow('PluginContext destroyed');
    });

    it('is safe to call destroy() with no pending requests', () => {
      expect(() => ctx.destroy()).not.toThrow();
    });

    it('clears all pending requests after destroy', async () => {
      const p = ctx.readPiece('x');
      ctx.destroy();
      await p.catch(() => {
        /* expected */
      });

      // A subsequent destroy should not throw
      expect(() => ctx.destroy()).not.toThrow();
    });
  });
});
