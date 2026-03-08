## Summary

Implement soft/deformable avatars where the body mesh deforms under garment pressure (e.g., tight waistband creating skin indentation, bra compression, corset shaping). Currently avatars are rigid collision bodies.

**Competitive context:** Both CLO3D and Browzwear support soft body avatars. This is important for lingerie, shapewear, corsetry, and tight-fitting garment design.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §8 — Avatar System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Avatar mesh deforms under garment collision pressure
- Configurable body stiffness per region (soft tissue vs bone)
- Stiffness map: vertex-painted softness values
- Collision response: garment pushes into avatar surface
- Visual: realistic body compression under tight garments
- Toggle: rigid vs soft avatar mode

## Implementation Strategy

1. Add per-vertex compliance to avatar collision mesh
2. When garment pushes against avatar, allow avatar vertices to move inward
3. Spring-back force returns avatar to rest shape
4. Stiffness map: high at skeleton/bone areas, low at soft tissue
5. Update collision mesh geometry each frame for garment re-collision

## Acceptance Criteria

- [ ] Avatar mesh deforms under garment pressure
- [ ] Configurable stiffness map (soft tissue vs rigid bone)
- [ ] Spring-back to rest shape when pressure removed
- [ ] Toggle between rigid and soft avatar modes
- [ ] Visible indentation under tight garments (waistband, bra)
