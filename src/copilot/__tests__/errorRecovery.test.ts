import { describe, it, expect, vi } from 'vitest';
import {
  classifyError,
  calculateBackoff,
  retryWithBackoff,
  getErrorMessage,
  simplifyOutline,
  isOfflineMode,
  getOfflineActions,
  RecoveryStrategy,
} from '../errorRecovery';
import type { ProviderConfig } from '../providers/types';

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

  it('should classify rate limit errors (429)', () => {
    expect(classifyError(new Error('429 Too Many Requests'))).toBe('rate_limit');
  });

  it('should classify rate limit by message', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
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

  it('should classify provider unavailable', () => {
    expect(classifyError(new Error('500 Internal Server Error'))).toBe('provider_unavailable');
  });

  it('should classify invalid params', () => {
    expect(classifyError(new Error('Invalid parameters: missing required field'))).toBe('invalid_params');
  });

  it('should classify tool execution errors', () => {
    expect(classifyError(new Error('Execution error: Piece not found'))).toBe('tool_execution');
  });

  it('should classify unknown errors', () => {
    expect(classifyError(new Error('Something weird happened'))).toBe('unknown');
  });

  it('should handle string errors', () => {
    expect(classifyError('401 Unauthorized')).toBe('auth');
  });
});

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

  it('should cap at maxMs', () => {
    const d = calculateBackoff(10, 1000, 5000);
    expect(d).toBeLessThanOrEqual(5000);
  });

  it('should work with custom base', () => {
    const d = calculateBackoff(0, 500, 10000);
    expect(d).toBeGreaterThanOrEqual(500);
    expect(d).toBeLessThanOrEqual(750);
  });
});

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
    expect(result.message).toContain('API key');
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
});

describe('getErrorMessage', () => {
  it('should return setup instructions for auth errors', () => {
    const msg = getErrorMessage('auth', new Error('401'));
    expect(msg).toContain('API key');
    expect(msg).toContain('console.anthropic.com');
  });

  it('should return rate limit message', () => {
    const msg = getErrorMessage('rate_limit', new Error('429'));
    expect(msg).toContain('Rate limit');
  });

  it('should return network error message', () => {
    const msg = getErrorMessage('network', new Error('failed'));
    expect(msg).toContain('Network error');
  });

  it('should include raw message for tool errors', () => {
    const msg = getErrorMessage('tool_execution', new Error('Piece XYZ not found'));
    expect(msg).toContain('Piece XYZ not found');
  });
});

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
});

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
});

describe('getOfflineActions', () => {
  it('should return at least 5 actions', () => {
    const actions = getOfflineActions();
    expect(actions.length).toBeGreaterThanOrEqual(5);
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
  });
});

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
    expect(result.message).toContain('API key');
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
    ).rejects.toThrow('API key');
  });
});
