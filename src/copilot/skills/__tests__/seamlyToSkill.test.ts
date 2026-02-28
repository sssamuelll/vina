/**
 * Tests for Seamly2D to CommunitySkill converter.
 */
import { describe, it, expect } from 'vitest';
import { convertSeamlyToSkill, generateTriggers, inferTags } from '../seamlyToSkill';

const MINIMAL_SM2D = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <draftBlock name="bodice_block">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="endLine" basePoint="1" angle="90" length="10" />
    </calculation>
  </draftBlock>
</pattern>`;

describe('convertSeamlyToSkill', () => {
  it('converts .sm2d to CommunitySkill', () => {
    const result = convertSeamlyToSkill(MINIMAL_SM2D, 'bodice_block');

    expect(result.skill.schemaVersion).toBe('1.0.0');
    expect(result.skill.metadata.name).toBe('Bodice Block');
    expect(result.skill.metadata.id).toBe('local:bodice-block');
    expect(result.skill.skill.triggers).toContain('bodice block');
    expect(result.skill.skill.constructionSteps).toHaveLength(2);
    expect(result.skill.skill.constructionSteps[0].instruction).toContain('Mark point A');
  });

  it('returns validation stats', () => {
    const result = convertSeamlyToSkill(MINIMAL_SM2D, 'test');

    expect(result.validation.valid).toBe(true);
    expect(result.validation.stats.totalSteps).toBe(2);
    expect(result.validation.stats.convertedSteps).toBe(2);
  });

  it('handles pattern with splines', () => {
    const withSpline = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <draftBlock name="test">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
      <point id="2" name="B" type="single" x="10" y="0" />
      <spline id="3" type="simpleInteractive" point1="1" point4="2" angle1="45" angle2="135" />
    </calculation>
  </draftBlock>
</pattern>`;

    const result = convertSeamlyToSkill(withSpline, 'test_curve');
    expect(result.skill.skill.constructionSteps).toHaveLength(3);
    expect(result.skill.skill.constructionSteps[2].instruction).toContain('curve');
    expect(result.skill.skill.constructionSteps[2].toolCalls).toContain('createCurve');
  });

  it('handles pattern with increments/variables', () => {
    const withVars = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <increments>
    <increment name="ease" formula="2" description="Basic ease" />
    <increment name="chest_quarter" formula="chest/4" description="Quarter chest" />
  </increments>
  <draftBlock name="test">
    <calculation>
      <point id="1" name="A" type="single" x="0" y="0" />
    </calculation>
  </draftBlock>
</pattern>`;

    const result = convertSeamlyToSkill(withVars, 'vars_test');
    expect(result.skill.skill.formulas).toHaveProperty('ease');
    expect(result.skill.skill.formulas.ease.expression).toBe('2');
    expect(result.skill.skill.formulas.chest_quarter.expression).toBe('chest/4');
  });

  it('generates warnings for unknown step types', () => {
    const withUnknown = `<?xml version="1.0" encoding="UTF-8"?>
<pattern>
  <unit>cm</unit>
  <draftBlock name="test">
    <calculation>
      <point id="1" name="X" type="weirdNewType" x="0" y="0" />
    </calculation>
  </draftBlock>
</pattern>`;

    const result = convertSeamlyToSkill(withUnknown, 'unknown_test');
    expect(result.validation.warnings.length).toBeGreaterThan(0);
    expect(result.validation.warnings[0]).toContain('weirdNewType');
  });
});

describe('generateTriggers', () => {
  it('generates bilingual triggers', () => {
    const triggers = generateTriggers('bodice_block');
    expect(triggers).toContain('bodice block');
    expect(triggers.length).toBeGreaterThanOrEqual(2);
  });

  it('adds Spanish translations for known terms', () => {
    const triggers = generateTriggers('basic_bodice');
    expect(triggers.some(t => t.includes('corpiño'))).toBe(true);
    expect(triggers.some(t => t.includes('básico'))).toBe(true);
  });

  it('handles sleeve patterns', () => {
    const triggers = generateTriggers('fitted_sleeve');
    expect(triggers).toContain('fitted sleeve');
    expect(triggers.some(t => t.includes('manga'))).toBe(true);
  });

  it('returns unique triggers', () => {
    const triggers = generateTriggers('test_test');
    const unique = [...new Set(triggers)];
    expect(triggers.length).toBe(unique.length);
  });
});

describe('inferTags', () => {
  it('infers tags from name', () => {
    const tags = inferTags('basic_bodice_block');
    expect(tags).toContain('bodice');
    expect(tags).toContain('basic');
    expect(tags).toContain('block');
  });

  it('handles sleeve patterns', () => {
    const tags = inferTags('fitted_sleeve');
    expect(tags).toContain('sleeve');
    expect(tags).toContain('fitted');
  });

  it('handles multiple garment types', () => {
    const tags = inferTags('pants_trousers_fit');
    expect(tags).toContain('pants');
    expect(tags).toContain('trousers');
  });

  it('returns empty array for unknown terms', () => {
    const tags = inferTags('xyz_pattern');
    expect(tags).toEqual([]);
  });
});
