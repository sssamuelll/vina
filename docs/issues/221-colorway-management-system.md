## Summary

Build a colorway management system that allows designers to create and manage multiple color/material variations of a single garment without duplicating the pattern or simulation. Each colorway stores independent material overrides (fabric color, texture, trim color) while sharing the same pattern geometry.

**Competitive context:** Both CLO3D and Browzwear treat colorways as a first-class concept. Fashion brands typically produce 3–12 colorways per style. Without this feature, users must duplicate entire projects for each color variation.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §6 — Colorway Management](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Core Colorway System
- Create, duplicate, rename, reorder, and delete colorways
- Each colorway stores a set of material overrides per pattern piece
- One colorway is always "active" — the 3D viewport renders the active colorway
- Switching colorways updates all materials in real-time (no re-simulation needed)
- Default colorway inherits base materials; overrides are layered on top

### Per-Colorway Overrides
- **Fabric color/tint** — change base color without changing texture
- **Diffuse texture** — swap print/pattern per colorway
- **Trim color** — buttons, zippers, thread color per colorway
- **Topstitch color** — thread color per colorway

### Linked vs Unique Items
- "Linked" materials update across all colorways when edited
- "Unique" materials are independent per colorway
- Toggle linked/unique per material slot

### Colorway Panel UI
- Horizontal colorway strip with color chip previews (like CLO3D)
- Click chip to switch active colorway
- Right-click for duplicate/rename/delete context menu
- Per-piece material override grid

### Quick Colorway Comparison
- Side-by-side view: render 2–4 colorways simultaneously in split viewport
- Export all colorways as image grid (for line sheets)

---

## Data Model

```typescript
interface Colorway {
  id: string;
  name: string;
  overrides: Map<string, MaterialOverride>; // key = pieceId or materialSlotId
  trimOverrides: Map<string, TrimOverride>;  // key = trimId
}

interface MaterialOverride {
  colorTint?: string;           // hex color
  diffuseTextureUrl?: string;   // replaces base diffuse
  roughness?: number;
  linked: boolean;              // if true, shares with base colorway
}
```

---

## Implementation Strategy

### Phase 1: State & Data Model
1. Create `colorwayStore.ts` (Zustand) — CRUD operations for colorways
2. Define `Colorway` and `MaterialOverride` types
3. Add `activeColorwayId` to store
4. Serialize colorways in project save/load

### Phase 2: Material Override Application
1. When rendering cloth, resolve material = base + colorway override
2. Material resolution: `getEffectiveMaterial(pieceId, activeColorway)`
3. Real-time swap on colorway switch (no simulation restart)

### Phase 3: UI Panel
1. `ColorwayStrip` — horizontal bar with color chips
2. `ColorwayEditor` — per-piece material override grid
3. Quick-switch on chip click
4. Add/delete/duplicate via toolbar buttons

### Phase 4: Comparison & Export
1. Split viewport for side-by-side colorway comparison
2. Batch export: render each colorway → composite image grid

---

## Key Files to Create

- `src/stores/colorwayStore.ts` — colorway state management
- `src/components/ColorwayPanel/ColorwayStrip.tsx` — colorway chip bar
- `src/components/ColorwayPanel/ColorwayEditor.tsx` — override editor

## Dependencies

- #220 — PBR Material & Texture System (colorways override materials)
- #224 — Trim Library (colorways override trim colors)

## Acceptance Criteria

- [ ] Users can create, duplicate, rename, and delete colorways
- [ ] Switching colorways updates 3D viewport materials in real-time
- [ ] Per-piece material overrides (color, texture) work independently per colorway
- [ ] Linked items propagate changes across all colorways
- [ ] Colorway data persists in project save/load
- [ ] Colorway strip UI allows one-click switching
- [ ] At least 8 colorways supported per garment
- [ ] Export: all colorways rendered as composite image
