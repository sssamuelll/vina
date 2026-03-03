// src/copilot/reasoning/bridge/__tests__/domainBootstrap.test.ts
import { describe, it, expect } from 'vitest';
import { buildDomainBootstrap } from '../domainBootstrap';

describe('buildDomainBootstrap', () => {
  it('returns a non-empty string', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('mentions garment pattern modification', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt.toLowerCase()).toContain('garment');
    expect(prompt.toLowerCase()).toContain('pattern');
  });

  it('mentions available piece types', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt).toContain('bodice');
    expect(prompt).toContain('sleeve');
  });

  it('mentions edge types', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt).toContain('neckline');
    expect(prompt).toContain('armhole');
  });

  it('mentions multilingual capability', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt.toLowerCase()).toContain('language');
  });

  it('includes ExecutionPlan JSON format instructions', () => {
    const prompt = buildDomainBootstrap();
    expect(prompt).toContain('"intent"');
    expect(prompt).toContain('"steps"');
    expect(prompt).toContain('"execute"');
  });
});
