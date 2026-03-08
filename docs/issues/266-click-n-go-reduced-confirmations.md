# #266 — Click'n'Go (Reduced Confirmations)

> **Labels**: `feature`, `gerber-integration`, `ux`, `tier-c`
> **Milestone**: v0.8
> **Priority**: Sprint 6

## Summary

Expert mode preference that reduces confirmation dialogs for non-destructive operations, speeding up workflow for experienced users.

## Motivation

Gerber's Click'n'Go preference reduces confirmation clicks. Experienced pattern makers know what they're doing and don't need "Are you sure?" for every seam allowance change. This is UX polish that significantly improves productivity for power users.

## Requirements

### Core
- [ ] "Expert mode" toggle in settings
- [ ] Per-tool confirmation config: always / expert-skip / never
- [ ] Non-destructive operations skip confirmation in expert mode
- [ ] Destructive operations (delete, merge, split) always confirm
- [ ] Remember last-used parameters for tools

### Tool Memory
- [ ] Last seam allowance width remembered
- [ ] Last notch type remembered
- [ ] Last fabric code remembered
- [ ] Last corner type remembered
- [ ] Parameters persist across sessions

### UI
- [ ] Toggle in Settings → Workflow → Expert Mode
- [ ] Per-tool override in Settings → Tools
- [ ] Visual indicator when expert mode is active

### Copilot Integration
- [ ] Copilot is inherently "click-free" (natural language → execution)
- [ ] No specific tool needed

## Dependencies

- None (standalone UX feature)

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §15
