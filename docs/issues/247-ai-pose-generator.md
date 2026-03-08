## Summary

Implement an AI-powered pose generator that creates avatar poses from text descriptions or reference images. Reduces the friction of manually posing avatar joints.

**Competitive context:** CLO3D added AI Pose Generator (beta) in 2025.0. Browzwear has similar capabilities. This leverages the AI copilot infrastructure already in OpenClo.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §8 — Avatar System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Text-to-pose: "standing with hands on hips", "walking pose", "seated cross-legged"
- Image-to-pose: upload reference photo → extract pose via pose estimation
- Pose estimation: MediaPipe Pose or similar for 2D keypoint extraction
- 2D keypoints → 3D joint angles via inverse kinematics
- Copilot integration: "pose the avatar in a walking position"

## Implementation Strategy

1. Text-to-pose: map common descriptions to pose library presets
2. Image-to-pose: run MediaPipe/MoveNet in browser → extract 2D keypoints
3. Lift 2D keypoints to 3D using avatar skeleton proportions
4. Apply IK solver to compute joint angles from target positions

## Dependencies

- #229 — Avatar Posing & Deformation (IK/FK system required)

## Acceptance Criteria

- [ ] Text descriptions generate plausible poses
- [ ] Reference image upload extracts pose via ML model
- [ ] Generated poses apply to avatar skeleton
- [ ] Copilot command: "pose the avatar as..." works naturally
