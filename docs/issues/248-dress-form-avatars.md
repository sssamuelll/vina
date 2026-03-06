## Summary

Add dress form (mannequin) avatars as an alternative to human body avatars. Dress forms are used in traditional draping workflows and eliminate visual distraction from avatar appearance.

**Competitive context:** CLO3D offers dress form avatars for draping mode. Many pattern makers prefer draping on a form rather than a human figure.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §8 — Avatar System](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

- Built-in dress form models: women's, men's, children's (standard sizes)
- Adjustable measurements (bust, waist, hip, shoulder width)
- Dress form stand/base rendering
- Pin support: attach fabric to form at specific points
- Seamless switch between human avatar and dress form

## Implementation Strategy

1. Model or source CC0-licensed dress form 3D meshes
2. Parametric scaling via measurement input (scale regions independently)
3. Register as special avatar type in collision body system
4. Add form selector in avatar panel (human vs dress form)

## Acceptance Criteria

- [ ] At least one women's dress form avatar bundled
- [ ] Adjustable bust, waist, hip measurements
- [ ] Dress form works as collision body for simulation
- [ ] Switch between human avatar and dress form without losing garment
