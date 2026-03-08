# #252 — Walk Seam Verification

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 1

## Summary

Implement a walk seam verification tool that compares two sewn edges for length matching, ease distribution, and mismatch detection — the most-used QA tool in production pattern making.

## Motivation

Pattern makers check seam matching constantly before sending patterns to production. A 5mm mismatch on a curved armhole seam can cause puckering, pulling, or assembly defects. Gerber AccuMark's Walk Seam is one of its most-used features. OpenClo already has sewing data — this tool surfaces that data as a verification workflow.

## Requirements

### Core
- [ ] Select two sewn edges → report length delta (mm), ease %, and mismatch location
- [ ] Visual overlay: superimpose two edges aligned at a reference notch
- [ ] Arc-length measurement along curves (not straight-line distance)
- [ ] Tolerance config: warn if delta > threshold (default 3mm, user-configurable)
- [ ] Support for eased seams: show intended ease vs actual ease

### UI
- [ ] Walk Seam button in toolbar (2D tools section)
- [ ] Overlay panel showing: Edge A length, Edge B length, Delta, Ease %
- [ ] Color-coded mismatch visualization on the edges (green = ok, yellow = warn, red = fail)
- [ ] Click on mismatch region to zoom to that location

### Copilot Integration
- [ ] Tool: `walkSeam({ seam: "bodice-front:armhole → sleeve:cap" })`
- [ ] Returns: `{ lengthA, lengthB, delta, easePercent, matches: boolean }`
- [ ] Copilot can suggest fixes: "Sleeve cap is 4mm longer — suggest adding ease to armhole?"

### Export
- [ ] Walk seam report exportable as part of tech pack (#223)

## Technical Notes

- Use existing sewing data from Redux store
- Arc-length computed via numerical integration on Bezier/spline edges
- Reference notch alignment uses existing notch positions

## Dependencies

- Existing sewing system
- #253 Seam Corner Types (corner geometry affects seam length calculation)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §1
- [Gerber Comparison](../specs/GERBER-COMPARISON.md) — Walk Seam row
- [Seam Allowance API](../api/seam-allowance.md)
