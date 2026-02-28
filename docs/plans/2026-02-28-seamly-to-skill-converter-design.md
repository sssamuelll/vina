# Seamly2D to .oskill Converter Design

**Issue:** #173
**Epic:** #163 (Skill Marketplace & Copilot Extensibility)
**Date:** 2026-02-28

## Goal

Enable users to import Seamly2D patterns (.sm2d) and convert them into OpenClo skills that the Copilot can use to help users draft garments.

## Approach

**Instruction Generator** — Transform each Seamly2D geometric step into a natural language instruction + toolCalls. This gives the Copilot maximum understanding of the construction process, allowing it to:
- Explain each step to the user
- Execute tool calls
- Adapt when users ask variations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SkillMarketplace UI                          │
│  ┌─────────────┐                                                │
│  │ Import .sm2d│ ← User uploads file                            │
│  └──────┬──────┘                                                │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              seamlyToSkill.ts (NEW)                         ││
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      ││
│  │  │ parseSeamly  │→ │ generateMeta │→ │ generateSteps│      ││
│  │  │   (XML→JSON) │  │  (triggers)  │  │ (instructions)│      ││
│  │  └──────────────┘  └──────────────┘  └──────────────┘      ││
│  │                           ↓                                 ││
│  │                    CommunitySkill                           ││
│  └─────────────────────────────────────────────────────────────┘│
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │ Edit Modal  │ ← User can edit name, triggers, author        │
│  └──────┬──────┘                                                │
│         ▼                                                       │
│  SkillRegistry.register() → IndexedDB                           │
└─────────────────────────────────────────────────────────────────┘
```

### Components

| File | Purpose |
|------|---------|
| `src/copilot/skills/seamlyToSkill.ts` | Core converter logic (browser-compatible) |
| `src/components/SkillMarketplace/ImportSeamlyModal.tsx` | UI for import + edit |

## Instruction Generation

Each Seamly2D step type maps to a natural instruction:

```typescript
const STEP_TEMPLATES: Record<string, (step) => string> = {
  single: (s) => `Mark point ${s.name} at coordinates (${s.x}, ${s.y})`,
  endLine: (s) => `From point ${s.basePoint}, draw a line at ${s.angle}° with length ${s.length} to create point ${s.name}`,
  alongLine: (s) => `Along the line from ${s.firstPoint} to ${s.secondPoint}, measure ${s.length} to mark point ${s.name}`,
  normal: (s) => `From point ${s.firstPoint}, draw a perpendicular line of length ${s.length} to create point ${s.name}`,
  spline: (s) => `Draw a curve from ${s.point1} to ${s.point4} with angles ${s.angle1}° and ${s.angle2}°`,
  // ~20 more types
}

const STEP_TOOLS: Record<string, string[]> = {
  single: ['createPoint'],
  endLine: ['createPoint'],
  alongLine: ['createPoint'],
  spline: ['createCurve'],
  line: ['createLine'],
}
```

## Data Flow

```typescript
// Input: .sm2d XML file
const xmlContent = await file.text();

// Step 1: Parse XML → SeamlyPattern
const seamlyPattern = parseSeamlyXML(xmlContent);

// Step 2: Generate metadata (auto-filled, user can edit)
const metadata: CommunitySkillMetadata = {
  id: `local:${slugify(seamlyPattern.name)}`,
  name: humanize(seamlyPattern.name),
  version: "1.0.0",
  author: "imported",
  description: `Pattern imported from Seamly2D: ${seamlyPattern.name}`,
  tags: inferTags(seamlyPattern),
  license: "MIT"
};

// Step 3: Generate bilingual triggers
const triggers = generateTriggers(seamlyPattern.name);

// Step 4: Convert construction → instructional steps
const constructionSteps = seamlyPattern.construction.map((step, i) => ({
  order: i + 1,
  instruction: STEP_TEMPLATES[step.type]?.(step) ?? `Execute ${step.type} operation`,
  toolCalls: STEP_TOOLS[step.type] ?? [],
  seamlyData: step
}));

// Step 5: Extract formulas
const formulas = extractFormulas(seamlyPattern.variables, seamlyPattern.construction);

// Output: CommunitySkill
const skill: CommunitySkill = {
  schemaVersion: "1.0.0",
  metadata,
  skill: { name, triggers, description, methods, formulas, easeTable: {}, constructionSteps }
};
```

## UI — Import Modal

```
┌─────────────────────────────────────────────────────────────┐
│ Import Seamly2D Pattern                               [X]   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │  📁 Drop .sm2d file here or click to browse         │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Name:     [Bodice Block________________]  ← auto-filled    │
│  Author:   [Your Name___________________]                   │
│  Tags:     [bodice] [block] [+]                            │
│                                                             │
│  Triggers (how users will ask for this):                   │
│  [bodice block_______] [basic bodice____]                  │
│  [corpiño básico_____] [+]                                 │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Preview: 47 construction steps, 2 pieces            │   │
│  │ Required measurements: chest, waist, hip_circ       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│                          [Cancel]  [Import Skill]          │
└─────────────────────────────────────────────────────────────┘
```

**Integration:**
- New "Import .sm2d" button in SkillMarketplace "Installed" tab
- Opens `ImportSeamlyModal`
- On import → `registry.register(skill, 'local')`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid XML | Toast: "Invalid file format" |
| No construction | Toast: "Pattern has no construction steps" |
| Missing measurements | Warning: "⚠ Missing .smis file. Default values used" |
| Unsupported step | Skip silently, show "45 of 47 steps converted" |
| Skill exists | Modal: "Replace existing skill?" |
| Empty name | Disable Import button |

### Validation Interface

```typescript
interface ImportValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
  stats: {
    totalSteps: number;
    convertedSteps: number;
    pieces: number;
    measurements: string[];
  };
}
```

## Acceptance Criteria

- [ ] User can import .sm2d file via drag-drop or file picker
- [ ] Auto-generates name, triggers, tags from pattern
- [ ] User can edit metadata before import
- [ ] Shows preview with step count, pieces, measurements
- [ ] Converts construction steps to natural instructions
- [ ] Registers skill in SkillRegistry (IndexedDB)
- [ ] Copilot can find and use imported skill via triggers
- [ ] Handles errors gracefully with user feedback
