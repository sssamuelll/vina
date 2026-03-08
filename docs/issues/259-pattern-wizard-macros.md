# #259 — Pattern Wizard Macros

> **Labels**: `feature`, `gerber-integration`, `automation`, `tier-b`
> **Milestone**: v0.8
> **Priority**: Sprint 4

## Summary

Record sequences of pattern operations as replayable macros, enabling batch processing and workflow automation.

## Motivation

Repetitive operations (e.g., "apply this dart manipulation to all bodice fronts") are common in pattern making. Gerber's Pattern Wizard allows recording and replaying up to 25 scripts per group. OpenClo's copilot is more powerful (natural language), but macros are faster for repetitive tasks and don't require AI inference.

## Requirements

### Recording
- [ ] Record mode: capture tool invocations as ordered step list
- [ ] Steps include: tool name, parameters, target piece/element
- [ ] Pause/resume recording
- [ ] Discard recording

### Replay
- [ ] Select target piece(s) → replay macro
- [ ] Parameter substitution: relative references (e.g., "edge 3" not "bodice-front:edge-3")
- [ ] Step-by-step mode: execute one step at a time with preview
- [ ] Batch mode: apply to multiple pieces in sequence

### Macro Storage
- [ ] Macro = JSON array of tool calls with relative references
- [ ] Save with name, description, category
- [ ] Macro library: project-level and user-level storage
- [ ] Import/export macros as JSON files

### Integration
- [ ] Macros are essentially pre-built copilot execution plans
- [ ] Copilot can suggest recording a macro: "You've done this 3 times — want to save as macro?"
- [ ] Copilot can replay macros: "Apply the dart-manipulation macro to back-bodice"

### Copilot Integration
- [ ] Tool: `recordMacro({ name: "dart-manipulation" })`
- [ ] Tool: `stopRecording()`
- [ ] Tool: `replayMacro({ name: "dart-manipulation", target: "back-bodice" })`
- [ ] Tool: `listMacros()`

## Technical Notes

- Macro format compatible with copilot bridge execution plans
- Tool calls captured via middleware in the tool dispatch pipeline
- Relative references resolved at replay time based on target context

## Dependencies

- Copilot bridge architecture (`src/copilot/bridge/`)
- Existing tool registry

## References

- [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md) §8
- [Copilot Bridge Architecture](../plans/2026-03-02-copilot-bridge-architecture-design.md)
