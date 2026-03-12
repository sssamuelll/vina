import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('selfCollision.wgsl — atomic accumulation', () => {
  let wgsl: string;

  beforeAll(() => {
    const shaderPath = resolve(
      __dirname,
      '../shaders/selfCollision.wgsl',
    );
    wgsl = readFileSync(shaderPath, 'utf-8');
  });

  // ─── Group 2 atomic bindings ────────────────────────────────────────────

  it('has scDelta binding with array<atomic<i32>>', () => {
    expect(wgsl).toMatch(/scDelta\s*:\s*array<atomic<i32>>/);
  });

  it('has scCorrCount binding with array<atomic<u32>>', () => {
    expect(wgsl).toMatch(/scCorrCount\s*:\s*array<atomic<u32>>/);
  });

  // ─── Entry points ───────────────────────────────────────────────────────

  it('has applyCorrections entry point', () => {
    expect(wgsl).toContain('fn applyCorrections(');
  });

  it('has hashCount entry point (unchanged)', () => {
    expect(wgsl).toContain('fn hashCount(');
  });

  it('has scatter entry point (unchanged)', () => {
    expect(wgsl).toContain('fn scatter(');
  });

  it('has resolveCollisions entry point', () => {
    expect(wgsl).toContain('fn resolveCollisions(');
  });

  // ─── Removed serial prefixSum ───────────────────────────────────────────

  it('does NOT contain fn prefixSum (removed, replaced by external shader)', () => {
    expect(wgsl).not.toContain('fn prefixSum');
  });

  // ─── Race-free resolve: atomic writes instead of direct j writes ────────

  it('resolveCollisions does NOT write positions[jdx] directly', () => {
    // Extract the resolveCollisions function body
    const resolveStart = wgsl.indexOf('fn resolveCollisions(');
    // Find the next top-level function after resolveCollisions
    const resolveBody = wgsl.slice(resolveStart);
    const nextFnMatch = resolveBody.match(/\n@compute[\s\S]*?fn (?!resolveCollisions)/);
    const resolveEnd = nextFnMatch
      ? resolveStart + (nextFnMatch.index ?? resolveBody.length)
      : wgsl.length;
    const resolveFn = wgsl.slice(resolveStart, resolveEnd);

    // Must NOT contain direct position writes like `positions[jdx] =` or `positions[jdx] -=`
    expect(resolveFn).not.toMatch(/positions\[jdx\]\s*[-+]?=/);
    expect(resolveFn).not.toMatch(/positions\[jdx\s*\+\s*1u\]\s*[-+]?=/);
    expect(resolveFn).not.toMatch(/positions\[jdx\s*\+\s*2u\]\s*[-+]?=/);
  });

  it('resolveCollisions uses atomicAdd on scDelta', () => {
    expect(wgsl).toContain('atomicAdd(&scDelta');
  });

  it('resolveCollisions uses atomicAdd on scCorrCount', () => {
    expect(wgsl).toContain('atomicAdd(&scCorrCount');
  });

  // ─── applyCorrections reset logic ──────────────────────────────────────

  it('applyCorrections contains atomicStore for scDelta reset', () => {
    expect(wgsl).toContain('atomicStore(&scDelta');
  });

  it('applyCorrections contains atomicStore for scCorrCount reset', () => {
    expect(wgsl).toContain('atomicStore(&scCorrCount');
  });

  // ─── COLLISION_SCALE constant ──────────────────────────────────────────

  it('defines COLLISION_SCALE constant', () => {
    expect(wgsl).toMatch(/const\s+COLLISION_SCALE\s*:\s*f32\s*=\s*1000000\.0/);
  });

  // ─── applyCorrections workgroup size ───────────────────────────────────

  it('applyCorrections uses workgroup_size(256)', () => {
    // Find the @compute decorator immediately before applyCorrections
    const applyIdx = wgsl.indexOf('fn applyCorrections(');
    const preceding = wgsl.slice(Math.max(0, applyIdx - 100), applyIdx);
    expect(preceding).toContain('@workgroup_size(256)');
  });
});
