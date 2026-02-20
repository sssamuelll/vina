# DXF Engine

> `src/utils/dxf/`

Import and export DXF files with **AAMA/ASTM D6673** layer mapping for industry-standard pattern exchange. Supports R12 and R2000+ formats, round-trip capability, and all common DXF entity types used in garment CAD.

## Overview

The DXF engine provides a full pipeline:

```
Import:  DXF string → parseDXF() → DXFDocument → dxfToPatternPieces() → PatternPiece[]
Export:  PatternPiece[] → generateDXFAAMA() → DXF string
```

Pieces (piezas) are mapped through AAMA numbered layers where each layer has a semantic role: cut lines (costuras), notches (muescas), grainline (hilo), draw lines, and internal cuts.

## Quick Example

```ts
import { parseDXF, dxfToPatternPieces, generateDXFAAMA } from '@openclo/utils/dxf';

// Import
const doc = parseDXF(dxfFileContent);
const pieces = dxfToPatternPieces(doc);

// Export
const dxfString = generateDXFAAMA(pieces, { version: 'R2000', aamaLayers: true });
```

## AAMA/ASTM D6673 Layer Mapping

| Layer Number | Layer Name | Role | Description |
|:---:|------------|------|-------------|
| `1` | CUT | `cut` | Cut line / piece outline (costura de corte) |
| `4` | NOTCH | `notch` | Notch marks (muescas) |
| `7` | GRAINLINE | `grainline` | Grain line direction (hilo) |
| `8` | DRAW | `draw` | Construction/draw lines |
| `11` | INTCUT | `intcut` | Internal cut lines (darts, pleats) |
| — | SEAM | `seam` | Seam allowance contour |
| — | LABEL | `label` | Text labels |

Use `layerRole(layerName)` to resolve any layer name (numbered or named) to its semantic role.

## Supported DXF Entities

| Entity | Import | Export | Notes |
|--------|:------:|:------:|-------|
| `LINE` | ✅ | ✅ | Straight segments (notches, grainlines) |
| `LWPOLYLINE` | ✅ | ✅ | R2000+ lightweight polylines with bulge arcs |
| `POLYLINE` + `VERTEX` | ✅ | — | R12-style polylines |
| `SPLINE` | ✅ | ✅ | Cubic Bézier (degree 3); others linearized |
| `ARC` | ✅ | — | Circular arcs → cubic Bézier approximation |
| `CIRCLE` | ✅ | — | Four-segment cubic Bézier approximation |
| `TEXT` / `MTEXT` | ✅ | ✅ | Piece name extraction; label export at height 2.5 |
| `INSERT` | ✅ | ✅ | Block references with translate/scale/rotate |
| `BLOCK` | ✅ | ✅ | One block per piece; `BLOCK_RECORD` for R2000+ |

## API Reference

### `parseDXF(content): DXFDocument`

Parses a DXF ASCII string into a structured document.

| Param | Type | Description |
|-------|------|-------------|
| `content` | `string` | Raw DXF file content |
| **Returns** | `DXFDocument` | Parsed header, layers, blocks, entities |

### `dxfToPatternPieces(doc): PatternPiece[]`

Converts a parsed DXF document to OpenClo pattern pieces.

- Each **block** becomes a pattern piece (or all entities as one piece if no blocks)
- Entities are grouped by layer role: cut→outline, notch/grainline/draw→internals
- Y-axis is flipped (DXF Y-up → screen Y-down)
- INSERT transforms (translate, scale, rotate) are applied to block entities

| Param | Type | Description |
|-------|------|-------------|
| `doc` | `DXFDocument` | Parsed DXF document |
| **Returns** | `PatternPiece[]` | Converted pattern pieces |

### `entityToPath(entity): PathCommand[]`

Converts a single DXF entity to SVG-style path commands. Handles LINE, LWPOLYLINE, POLYLINE, SPLINE, ARC, CIRCLE.

### `generateDXFAAMA(pieces, options?): string`

Generates an AAMA/ASTM D6673 compliant DXF string.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `pieces` | `PatternPiece[]` | — | Pieces to export |
| `options.version` | `'R12' \| 'R2000'` | `'R2000'` | DXF version |
| `options.aamaLayers` | `boolean` | `true` | Use numbered AAMA layers |
| **Returns** | `string` | Complete DXF file content |

**Export structure:**
- `HEADER` — ACADVER AC1015, INSUNITS=4 (mm), MEASUREMENT=1 (metric)
- `TABLES` — LAYER definitions + BLOCK_RECORD (R2000+)
- `BLOCKS` — One block per piece with outline on layer 1, internals on appropriate layers
- `ENTITIES` — INSERT references spaced 30 units apart

### `downloadDXFAAMA(pieces, filename?, options?): void`

Browser helper. Generates DXF and triggers file download.

### `layerRole(layerName): string`

Maps a layer name to its semantic role: `'cut'`, `'notch'`, `'grainline'`, `'draw'`, `'intcut'`, `'seam'`, `'label'`, or `'unknown'`.

## Types

### `DXFDocument`

```ts
interface DXFDocument {
  header: Map<string, string | number>;
  layers: DXFLayer[];
  blocks: Map<string, DXFBlock>;
  entities: DXFEntity[];
}
```

### `DXFLayer`

```ts
interface DXFLayer {
  name: string;
  color: number;
  lineType: string;
}
```

### `DXFEntity`

```ts
interface DXFEntity {
  type: DXFEntityType;  // 'LINE' | 'LWPOLYLINE' | 'SPLINE' | 'ARC' | 'CIRCLE' | ...
  layer: string;
  data: DXFEntityData;  // Union of entity-specific data interfaces
}
```

### `DXFExportOptions`

```ts
interface DXFExportOptions {
  version: 'R12' | 'R2000';
  aamaLayers: boolean;
}
```

### `AAMA_LAYERS` (constant)

```ts
const AAMA_LAYERS = { CUT: '1', NOTCH: '4', GRAINLINE: '7', DRAW: '8', INTCUT: '11' };
```

## Round-Trip Notes

Import → export preserves:
- Piece outlines (cut layer)
- Internal lines (notches, grainlines, darts)
- Piece names (from TEXT entities)

Not preserved in round-trip:
- Exact spline parameterization (arcs/circles become cubic Bézier)
- Layer colors and line types (re-created from AAMA defaults)
- Header variables beyond ACADVER/INSUNITS

## Related

- [Seam Allowance](./seam-allowance.md) — generates offset contour exported on DRAW layer
- [Grading](./grading.md) — graded pieces can be batch-exported
- [Nesting](./nesting.md) — nested layouts can be exported as multi-piece DXF
