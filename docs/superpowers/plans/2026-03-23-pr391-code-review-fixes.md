# PR #391 Code Review Fixes — Implementation Plan

> **For agentic workers:** Execute task-by-task.

**Goal:** Fix all 8 issues found during code review of PR #391 (Rendering Enhancements).

**Branch:** `feat/rendering-enhancements-377`

---

## Issues

| # | Issue | Task |
|---|-------|------|
| 1 | 7 render copilot tools missing execute handlers | Task 1 |
| 2 | setXrayMode drops xrayOpacitySnapshot restore | Task 2 |
| 3 | AvatarModel wireframe→visible leaves avatar black | Task 3 |
| 4 | Surface modes ignored when TSL/WebGPU active | Task 4 (documented) |
| 5 | WebP format silently degrades to PNG | Task 5 |
| 6 | NaN clamp in renderSettingsSlice | Task 6 |
| 7 | EXR export uses disposed renderTarget | Task 7 |
| 8 | turntableRenderer no camera restore on error | Task 8 |
