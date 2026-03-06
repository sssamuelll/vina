# #261 — Walk/Measure Along Curve

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-b`
> **Milestone**: v0.8
> **Priority**: Sprint 2

## Summary

Measure distance along curves (geodesic/arc-length), not just straight-line distance — essential for validating curved seams like armholes and necklines.

## Motivation

The existing measure tool reports straight-line distance between two points. For curved seams (armhole, neckline, princess seam), the actual sewing length along the curve is what matters. Gerber's "rolling ruler" measures along the curve. This is critical for seam matching and pattern verification.

## Requirements

### Core
- [ ] Arc-length measurement along any edge or internal line
- [ ] Support Bezier/spline curves (numerical integration / Gauss-Legendre quadrature)
- [ ] Support polyline edges (sum of segment lengths)
- [ ] Cumulative distance display at any point along the curve

### Compare Mode
- [ ] Select two curves → show length delta at N sample points
- [ ] Visualize where the curves diverge most
- [ ] Report: total length A, total length B, max local delta, ease distribution

### UI
- [ ] "Measure Along Curve" mode in measure tool
- [ ] Animated dot walking along curve showing cumulative distance
- [ ] Distance markers at regular intervals (e.g., every 5cm)
- [ ] Hover: show distance from start at cursor position

### Copilot Integration
- [ ] Tool: `measureAlongCurve({ edge: "front-bodice:armhole" })`
- [ ] Tool: `compareCurves({ edgeA: "front-bodice:armhole", edgeB: "sleeve:cap" })`
- [ ] Returns: `{ length, samplePoints: [{t, distance}] }`

## Technical Notes

- Arc-length for cubic Bezier: use Gauss-Legendre quadrature (5-point)
- For polylines: sum Euclidean segment lengths
- Accuracy target: < 0.1mm error on typical garment curves
- Extends existing measure tool

## Dependencies

- Existing measure tool
- #252 Walk Seam (shares arc-length computation)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §10
