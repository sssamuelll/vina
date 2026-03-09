import { describe, it, expect } from 'vitest';
import { IK_CHAINS, IK_END_EFFECTOR_BONES, JOINT_CONSTRAINTS, clampJointRotation } from '../avatarSlice';

describe('IK Solver Configuration', () => {
  it('every IK chain has a matching end-effector bone', () => {
    for (const chain of IK_CHAINS) {
      expect(IK_END_EFFECTOR_BONES[chain.name]).toBeDefined();
      expect(typeof IK_END_EFFECTOR_BONES[chain.name]).toBe('string');
    }
  });

  it('every IK chain bone has joint constraints', () => {
    for (const chain of IK_CHAINS) {
      for (const boneName of chain.bones) {
        expect(JOINT_CONSTRAINTS[boneName]).toBeDefined();
      }
    }
  });

  it('clampJointRotation respects min/max bounds', () => {
    // LeftForeArm: minX=0, maxX=145 — should clamp negative X to 0
    const result = clampJointRotation('LeftForeArm', { x: -30, y: 0, z: 0 });
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('clampJointRotation passes valid rotations through', () => {
    const rotation = { x: 45, y: 0, z: 0 };
    const result = clampJointRotation('LeftArm', rotation);
    // 45° is within LeftArm constraints (minX=-40, maxX=160)
    expect(Math.abs(result.x - 45)).toBeLessThan(5);
  });

  it('IK_CHAINS has 4 chains (arms + legs)', () => {
    expect(IK_CHAINS).toHaveLength(4);
    const names = IK_CHAINS.map(c => c.name);
    expect(names).toContain('leftArm');
    expect(names).toContain('rightArm');
    expect(names).toContain('leftLeg');
    expect(names).toContain('rightLeg');
  });

  it('end-effector bones are hands and feet', () => {
    expect(IK_END_EFFECTOR_BONES.leftArm).toBe('LeftHand');
    expect(IK_END_EFFECTOR_BONES.rightArm).toBe('RightHand');
    expect(IK_END_EFFECTOR_BONES.leftLeg).toBe('LeftFoot');
    expect(IK_END_EFFECTOR_BONES.rightLeg).toBe('RightFoot');
  });
});
