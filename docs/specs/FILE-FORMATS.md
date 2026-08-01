# Vina.ai — Interoperability & Ingestion Spec (v0.7)

## The "Silent Ingestion" Philosophy

Vina.ai is designed to be a frictionless ecosystem for professional designers. Our strategy for interoperability is not based on "Bridges" or "Converters" in the UI, but on a **Silent Ingestion Layer**.

When a user drags a legacy file (DXF, Seamly2D) into the workspace, the engine performs **Semantic Hydration**:
1. **Parsing**: Extracting geometric primitives (points, lines, curves).
2. **Elevation**: Using AI-driven heuristics and tailoring logic to tag these primitives (e.g., identifying which curve is an `Armhole` vs. a `Hem`).
3. **Constraint Synthesis**: Automatically generating geometric constraints to maintain technical integrity.
4. **Semantic Graph Output**: The result is a native Vina.ai `ProfessionalPatternPiece` with stable `pieceId:edgeName` references.

## Industry Interop Map

| Standard | Ecosystem | Status | Role in Vina.ai |
|----------|-----------|--------|---------------------|
| **DXF (ASTM D6673)** | Industry Universal | Full (Import + Export) | Standard Industrial Exchange |
| **Seamly2D (.val/.vit)**| Open Source Legacy | Auto-Ingest | Library Absorption (Invisible) |
| **OBJ** | 3D Universal | Export | 3D Mesh Output |
| **FBX/GLB/GLTF** | 3D Universal | Import (Collision) | Collision Body + Avatar Import |
| **PDF** | Print | Export | Physical Production Layouts |
| **CLO3D (.zprj)** | Professional 3D | Planned | Professional Migration Service |
| **Gerber/Lectra (ZIP)** | Industrial Prod. | Planned | Manufacturing Ingestion |

---

## Format 1: DXF (AAMA/ASTM D6673) — Full Support

### Overview
The **ASTM D6673** standard is the universal language of garment manufacturing. It uses standardized layers to represent technical data.

### Import (v0.7 — Full Entity Support)

The DXF parser (`src/utils/dxf/parser.ts`) and converter (`src/utils/dxf/converter.ts`) support:

| Entity Type | Support |
|-------------|---------|
| LINE | Full |
| LWPOLYLINE | Full |
| POLYLINE | Full |
| SPLINE | Full |
| ARC | Full |
| CIRCLE | Full |

Features:
- Layer-based role assignment (cut line, sew line, notch, grainline, etc.)
- Notch geometry extraction
- Unit handling (metric/imperial)
- Main function: `dxfToPatternPieces()`

### Layer-to-Semantic Mapping

| ASTM Layer | Semantic Label (Vina.ai) | Role |
|------------|-----------------------------|------|
| 1 | `Outline / CutLine` | The primary boundary of the piece |
| 2 | `SewLine` | Internal boundary for stitch placement |
| 3 | `InternalLine / Dart` | Shaping and design lines |
| 4 | `Notch` | Connection and alignment markers |
| 7 | `Grainline` | Fabric orientation vector |
| 8 | `Annotation / Label` | Piece name and metadata |
| 11 | `SemanticNode / Landmark` | Key anatomical anchor points |

### Export Strategy
Vina.ai exports **ASTM-compliant DXF** with `SPLINE` entities for maximum fidelity in industrial cutting machines (`src/utils/dxf/exportAAMA.ts`). The Semantic Graph is flattened accurately back into the legacy layer structure.

---

## Format 2: Seamly2D (.val / .vit) — Legacy Absorption

### Overview
Seamly2D (and its fork Valentina) is the most widespread open-source 2D pattern tool. It uses a parametric XML format where patterns are defined by formulas linked to a measurement file (`.vit`).

### Ingestion Strategy (Invisible)
1. **Formula Resolution**: The engine resolves the XML formulas against the provided measurement file.
2. **Geometric Extraction**: Converts the resolved XML nodes into a 2D vector representation.
3. **Semantic Mapping**: The Ingestion Layer uses the **Pattern Recognition Skill** to identify piece types based on topology.
4. **Hydration**: Generates the `SemanticNodes` and `SemanticEdges` with stable `pieceId:edgeName` IDs.

---

## Format 3: 3D Mesh Import (OBJ/FBX/GLB/GLTF) — Collision Bodies

### Overview
Any 3D mesh can be imported as a collision body for cloth simulation.

### Supported Formats
- **OBJ**: Static meshes
- **FBX**: Meshes with optional animation clips
- **GLB/GLTF**: Meshes with optional animation clips and embedded textures

### Import Pipeline
1. **Mesh Extraction**: Vertices, normals, and triangle indices extracted to `CollisionMeshData`.
2. **Transform Controls**: Per-body translate/rotate/scale via TransformControls gizmo.
3. **Collision Properties**: Per-body friction (0-1) and offset/margin (meters).
4. **Animation**: Embedded animation clips play via `THREE.AnimationMixer`; posed vertices re-extracted per frame.

---

## Format 4: CLO3D / Marvelous Designer (.zprj) — Planned

### Overview
`.zprj` files are ZIP archives containing DXF patterns, JSON metadata, and 3D simulation state.

### Hydration Strategy (Planned)
1. **Unzip**: Extract the internal `pattern.dxf` and `pattern_info.json`.
2. **Metadata Extraction**: Recover piece names, fabric properties, and seam connections.
3. **Avatar Alignment**: Map measurements to the Vina.ai parametric avatar.
4. **Re-Simulation**: Discard proprietary simulation state, perform fresh XPBD drape.

---

## Implementation Layer: Hydration Services

All ingestion logic is encapsulated in **Hydration Services**:

```typescript
interface HydrationService {
  canHandle(fileExtension: string): boolean;
  hydrate(fileData: Blob): Promise<ProfessionalPatternPiece[]>;
}
```

Key implementation files:
- `src/utils/dxf/parser.ts` — DXF file structure parsing
- `src/utils/dxf/converter.ts` — DXF entities to PatternPiece conversion
- `src/utils/dxf/exportAAMA.ts` — AAMA/ASTM DXF export
- `src/utils/seamly2d/` — Seamly2D ingestion
- `src/utils/import/` — 3D mesh import (OBJ/FBX/GLB/GLTF)
