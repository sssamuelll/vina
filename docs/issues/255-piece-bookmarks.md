# #255 — Piece Bookmarks (Version Compare)

> **Labels**: `feature`, `gerber-integration`, `pattern-engineering`, `tier-a`
> **Milestone**: v0.8
> **Priority**: Sprint 2

## Summary

Save snapshots of a pattern piece during development and compare versions with overlay visualization and diff reports.

## Motivation

Pattern development is iterative. A pattern maker might adjust a dart, evaluate the result, then want to compare against the previous version. Gerber's piece bookmarks (V2024.1) provide this. OpenClo has simulation snapshots (A/B/C) for 3D — this extends the concept to 2D pattern pieces.

## Requirements

### Core
- [ ] Bookmark = serialized piece state (points, curves, seam allowance, notches, grainline, internal lines)
- [ ] Up to 5 bookmarks per piece (configurable)
- [ ] Bookmark metadata: label, timestamp, optional note
- [ ] Bookmarks persist in project file

### Compare Mode
- [ ] Overlay: semi-transparent bookmark outline vs current piece
- [ ] Color coding: current = solid, bookmark = dashed/translucent
- [ ] Diff report: list of changed points, edge length deltas, area change (cm²)
- [ ] Highlight changed regions on the piece

### UI
- [ ] Bookmark button in piece context menu / toolbar
- [ ] Bookmark panel: list of bookmarks with labels and timestamps
- [ ] Click bookmark → toggle overlay
- [ ] Delete / rename bookmarks
- [ ] Quick bookmark: keyboard shortcut (Ctrl+B or similar)

### Copilot Integration
- [ ] Tool: `bookmarkPiece({ piece: "front-bodice", label: "before-dart-move" })`
- [ ] Tool: `comparePieceBookmark({ piece: "front-bodice", bookmark: "before-dart-move" })`
- [ ] Returns: `{ areaChange, perimeterChange, changedPoints: [...] }`

## Technical Notes

- Serialize piece via existing piece data model
- Deep clone to avoid reference issues
- Store in piece metadata or separate bookmark store slice
- Compare uses point-by-point diff with tolerance (0.1mm)

## Dependencies

- None (standalone feature)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §4
