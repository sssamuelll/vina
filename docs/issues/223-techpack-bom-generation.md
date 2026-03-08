## Summary

Implement automatic Bill of Materials (BOM) generation and tech pack export. The system auto-populates material quantities, trims, and construction details from the garment project and exports industry-standard specification sheets.

**Competitive context:** Both CLO3D and Browzwear auto-generate BOMs and tech packs from 3D garments. For production workflows, this is the bridge between design and manufacturing — without it, pattern makers must manually create spec sheets.

**Spec reference:** [COMPETITIVE-GAP-ANALYSIS.md §12 — Production Output](../specs/COMPETITIVE-GAP-ANALYSIS.md)

---

## Features

### Auto-Populated BOM
- Automatically extract from garment project:
  - **Fabrics**: name, type, area (m²), weight per piece, total yardage
  - **Trims**: buttons (count, size), zippers (length, type), snaps, rivets
  - **Thread**: topstitch thread type, color, estimated length
  - **Labels**: size labels, brand labels, care labels
- Per-piece fabric breakdown with grain direction
- Per-colorway BOM (quantities identical, materials differ)

### Cost Estimation
- Assign unit cost to each BOM item
- Auto-calculate total material cost per garment
- Per-colorway cost breakdown
- Currency selection (USD, EUR, GBP, CNY)
- Cost comparison across colorways

### Tech Pack Generation
- Export comprehensive specification sheets as PDF
- Includes:
  - Flat sketch (2D pattern layout)
  - 3D rendered views (front, back, side)
  - Measurement table with POM data
  - BOM table with quantities and costs
  - Construction notes (seam types, topstitch details)
  - Colorway swatches
  - Grading table (if graded)
- Configurable templates (brand logo, header, layout)

### Fabric Consumption
- Calculate total fabric consumption from nested layout
- Report yardage by fabric type
- Waste percentage based on nesting efficiency
- Integration with nesting tool (#233)

---

## Data Model

```typescript
interface BOMEntry {
  id: string;
  category: 'fabric' | 'trim' | 'thread' | 'label' | 'other';
  name: string;
  description: string;
  quantity: number;
  unit: 'meters' | 'yards' | 'pieces' | 'cm' | 'inches';
  unitCost: number;
  currency: string;
  colorwayOverrides: Map<string, { name: string; unitCost: number }>;
  autoPopulated: boolean; // true if extracted from garment
}

interface TechPack {
  garmentName: string;
  styleNumber: string;
  season: string;
  date: string;
  bom: BOMEntry[];
  measurements: POMEntry[];
  constructionNotes: string[];
  colorways: ColorwaySummary[];
  images: { view: string; url: string }[];
}
```

---

## Implementation Strategy

### Phase 1: BOM Data Extraction
1. Traverse garment state → extract fabric areas per piece
2. Count trims from trim placement data
3. Measure topstitch lengths from stitch paths
4. Create `bomStore.ts` with auto-populate logic

### Phase 2: BOM Editor UI
1. Table view with auto-populated + manual entries
2. Editable unit costs
3. Total cost auto-calculation
4. Per-colorway tab switching

### Phase 3: Tech Pack PDF Export
1. Use `jsPDF` or `@react-pdf/renderer` for PDF generation
2. Template system with configurable header/footer
3. Include 3D viewport snapshots (front/back/side)
4. Include measurement table and BOM

### Phase 4: Fabric Consumption Integration
1. Link to nesting tool output for accurate fabric usage
2. Report waste percentage and total yardage

---

## Key Files to Create

- `src/stores/bomStore.ts` — BOM state and auto-populate logic
- `src/components/BOMPanel/` — BOM editor table
- `src/utils/export/techPackGenerator.ts` — PDF generation
- `src/utils/export/bomExtractor.ts` — auto-extract from garment

## Dependencies

- #220 — PBR Materials (fabric names and properties)
- #221 — Colorway Management (per-colorway BOM)
- #224 — Trim Library (trim entries in BOM)
- #233 — Nesting (fabric consumption calculation)

## Acceptance Criteria

- [ ] BOM auto-populates fabric types, areas, and quantities from garment
- [ ] BOM auto-populates trim counts from placement data
- [ ] Manual BOM entries can be added/edited/deleted
- [ ] Unit costs assignable with total auto-calculation
- [ ] Per-colorway BOM with cost comparison
- [ ] Tech pack exports as PDF with 3D views, BOM, and measurements
- [ ] Fabric consumption reports yardage by fabric type
- [ ] Tech pack template supports custom branding (logo, colors)
