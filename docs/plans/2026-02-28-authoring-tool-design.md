# Authoring Tool — Export Project as .oskill

**Issue:** #178
**Epic:** #163 (Skill Marketplace & Copilot Extensibility)
**Date:** 2026-02-28

## Goal

Allow users to export their current parametric project as a reusable CommunitySkill (`.oskill` file) that can be shared and installed by others. The Copilot can then use this skill to help other users draft the same garment with their own measurements.

## Approach

**Builder Pattern** — Professional, testable architecture with a `SkillBuilder` class that progressively constructs the CommunitySkill from project state.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         File Menu                                │
│  ┌─────────────────┐                                            │
│  │ Export as Skill │ ← User clicks                              │
│  └────────┬────────┘                                            │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              ExportSkillModal.tsx                           ││
│  │  - Shows metadata form (name, author, triggers, tags)       ││
│  │  - Preview: steps count, formulas, pieces                   ││
│  │  - Export button → downloads .oskill                        ││
│  └────────┬────────────────────────────────────────────────────┘│
│           ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              SkillBuilder                                   ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      ││
│  │  │fromConstruct │→ │ withFormulas │→ │generateInstr │      ││
│  │  │    ion()     │  │     ()       │  │  uctions()   │      ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘      ││
│  │                           ↓                                 ││
│  │                    CommunitySkill                           ││
│  └─────────────────────────────────────────────────────────────┘│
│           ▼                                                      │
│  Download .oskill file (JSON)                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| File | Purpose |
|------|---------|
| `src/copilot/skills/SkillBuilder.ts` | Builder class for constructing CommunitySkill |
| `src/components/ExportSkillModal/ExportSkillModal.tsx` | UI modal for editing metadata and export |
| `src/components/ExportSkillModal/ExportSkillModal.css` | Styles (consistent with ImportSeamlyModal) |
| `src/components/MenuBar/` (modify) | Add "Export as Skill" to File menu |

## SkillBuilder API

```typescript
class SkillBuilder {
  // Core construction
  fromConstruction(state: ConstructionState): this
  withFormulas(variables: Record<string, string | number>): this
  withMetadata(meta: Partial<CommunitySkillMetadata>): this

  // Instruction generation (reuses instructionGenerator patterns)
  generateInstructions(): this

  // Trigger generation (bilingual ES/EN)
  generateTriggers(baseName: string): this

  // Build final result
  build(): CommunitySkill

  // Validation
  validate(): { valid: boolean; errors: string[]; warnings: string[] }

  // Preview stats (for modal)
  getPreview(): {
    stepCount: number
    formulaCount: number
    pieceCount: number
    measurements: string[]
  }
}
```

**Auto-generation:** If `generateTriggers()` is not called explicitly, `build()` auto-generates triggers from the metadata name.

### Construction → Steps Mapping

| ConstructionState | → | ConstructionStep |
|-------------------|---|------------------|
| `CPoint` (absolute) | → | "Mark point {name} at coordinates ({x}, {y})" |
| `CPoint` (endLine) | → | "From point {base}, draw line at {angle}° length {length} to create point {name}" |
| `CPoint` (alongLine) | → | "Along line from {p1} to {p2}, measure {length} to mark point {name}" |
| `CPoint` (normal) | → | "From point {p1}, draw perpendicular of length {length} to create point {name}" |
| `CPoint` (intersection) | → | "Find intersection of lines {line1} and {line2} to create point {name}" |
| `CLine` | → | "Draw construction line from {p1} to {p2}" |
| `CCurve` (spline) | → | "Draw curve from {p1} to {p2} with control angles" |

## UI — Export Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Export as Skill                                        [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name:     [Bodice Block________________]  ← auto-filled    │
│  Author:   [____________________________]                   │
│  Version:  [1.0.0_______________________]                   │
│  License:  [MIT_________________________]  ▼ dropdown       │
│                                                             │
│  Description:                                               │
│  [Parametric bodice block pattern with..._______________]   │
│                                                             │
│  Triggers (how users will ask for this):                   │
│  [bodice block_____] [bloque corpiño___] [+]               │
│                                                             │
│  Tags:                                                      │
│  [bodice] [block] [basic] [+]                              │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Preview                                              │  ││
│  │ • 24 construction steps                             │  ││
│  │ • 8 formulas                                        │  ││
│  │ • 2 pieces (Front, Back)                            │  ││
│  │ • Measurements: chest, waist, hip, shoulder         │  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ☑ Also register to local SkillRegistry                    │
│                                                             │
│                     [Cancel]  [Export .oskill]              │
└─────────────────────────────────────────────────────────────┘
```

**Behavior:**
- Auto-fills name from current project
- Preview updates via `builder.getPreview()`
- Export downloads `.oskill` file (JSON)
- Optional checkbox to register in local SkillRegistry (appears immediately in Marketplace)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No construction (empty project) | "Export as Skill" disabled in menu |
| Empty name | Export button disabled, hint "Name required" |
| No triggers | Auto-generates from name (not an error) |
| Validation fails | Toast with specific errors, no download |
| File write error | Toast: "Failed to export file" + retry |
| Skill exists in Registry | Modal: "Replace existing skill?" (if checkbox active) |

### Modal States

```typescript
type ExportState =
  | 'editing'    // User editing metadata
  | 'exporting'  // Generating file
  | 'success'    // Download complete
  | 'error';     // Something failed
```

### Validation

```typescript
const validation = builder.validate();

if (!validation.valid) {
  // Show errors in modal
  // "Missing required field: description"
  return;
}

// Warnings shown but allow continue
if (validation.warnings.length > 0) {
  // "⚠ No formulas found - skill may be limited"
}
```

## Data Flow

```
ConstructionState (points, lines, curves)
    ↓
SkillBuilder.fromConstruction()
    ↓
SkillBuilder.withFormulas(variables)
    ↓
SkillBuilder.generateInstructions()  ← NL instructions
    ↓
SkillBuilder.withMetadata(userEdits)
    ↓
SkillBuilder.build()
    ↓
CommunitySkill (JSON)
    ↓
Download .oskill file
    ↓ (optional)
SkillRegistry.register()
```

## Acceptance Criteria

- [ ] User can click "Export as Skill" from File menu
- [ ] Modal shows editable metadata with auto-filled defaults
- [ ] Preview shows step count, formulas, pieces, measurements
- [ ] Downloads valid `.oskill` file (validates against CommunitySkill schema)
- [ ] Optional: registers to local SkillRegistry
- [ ] Exported skill can be imported via SkillMarketplace
- [ ] Bilingual triggers generated (ES/EN)
- [ ] SkillBuilder has full test coverage
