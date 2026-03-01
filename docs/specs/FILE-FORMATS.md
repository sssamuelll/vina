# OpenClo.ai — Interoperability & Ingestion Spec

## The "Silent Ingestion" Philosophy

OpenClo.ai is designed to be a frictionless ecosystem for professional designers. Our strategy for interoperability is not based on "Bridges" or "Converters" in the UI, but on a **Silent Ingestion Layer**.

When a user drags a legacy file (DXF, Seamly2D, ZPRJ) into the workspace, the engine performs **Semantic Hydration**:
1.  **Parsing**: Extracting geometric primitives (points, lines, curves).
2.  **Elevation**: Using AI-driven heuristics and tailoring logic to tag these primitives (e.g., identifying which curve is an `Armhole` vs. a `Hem`).
3.  **Constraint Synthesis**: Automatically generating geometric constraints to maintain technical integrity.
4.  **Semantic Graph Output**: The result is a native OpenClo.ai `ProfessionalPatternPiece` ready for cognitive design.

## Industry Interop Map

| Standard | Ecosystem | Status | Role in OpenClo.ai |
|----------|-----------|--------|---------------------|
| **DXF (ASTM D6673)** | Industry Universal | ✅ Full | Standard Industrial Exchange |
| **Seamly2D (.val/.vit)**| Open Source Legacy | ✅ Auto-Ingest| Library Absorption (Invisible) |
| **CLO3D (.zprj)** | Professional 3D | 🔜 Planned | Professional Migration Service |
| **Gerber/Lectra (ZIP)** | Industrial Prod. | 🔜 Planned | Manufacturing Ingestion |
| **SVG** | Graphic Design | 🔜 Planned | Creative Sketch Ingestion |

---

## Format 1: Seamly2D (.val / .vit) — Legacy Absorption

### Overview
Seamly2D (and its fork Valentina) is the most widespread open-source 2D pattern tool. It uses a parametric XML format where patterns are defined by formulas linked to a measurement file (`.vit`).

### Ingestion Strategy (Invisible)
1.  **Formula Resolution**: The engine resolves the XML formulas against the provided measurement file.
2.  **Geometric Extraction**: Converts the resolved XML nodes into a 2D vector representation.
3.  **Semantic Mapping**: Since Seamly2D files often lack semantic tags, the Ingestion Layer uses the **Pattern Recognition Skill** to identify piece types (Bodice, Sleeve, etc.) based on topology.
4.  **Hydration**: Generates the `SemanticNodes` and `SemanticEdges` required for the OpenClo.ai graph.

---

## Format 2: DXF (AAMA/ASTM D6673)

### Overview
The **ASTM D6673** standard is the universal language of garment manufacturing. It uses standardized layers to represent technical data.

### Layer-to-Semantic Mapping

| ASTM Layer | Semantic Label (OpenClo.ai) | Role |
|------------|-----------------------------|------|
| 1 | `Outline / CutLine` | The primary boundary of the piece. |
| 2 | `SewLine` | Internal boundary for stitch placement. |
| 3 | `InternalLine / Dart` | Shaping and design lines. |
| 4 | `Notch` | Connection and alignment markers. |
| 7 | `Grainline` | Fabric orientation vector. |
| 8 | `Annotation / Label` | Piece name and metadata. |
| 11 | `SemanticNode / Landmark` | Key anatomical anchor points. |

### Export Strategy
OpenClo.ai exports **ASTM-compliant DXF** with `SPLINE` entities for maximum fidelity in industrial cutting machines. We ensure that our Semantic Graph is flattened accurately back into the legacy layer structure for external use.

---

## Format 3: CLO3D / Marvelous Designer (.zprj)

### Overview
`.zprj` files are ZIP archives containing DXF patterns, JSON metadata, and 3D simulation state.

### Hydration Strategy
1.  **Unzip**: Extract the internal `pattern.dxf` and `pattern_info.json`.
2.  **Metadata Extraction**: Use the JSON info to recover piece names, fabric properties, and existing seam connections.
3.  **Avatar Alignment**: Map the project's internal measurements to the OpenClo.ai parametric avatar.
4.  **Re-Simulation**: We discard the proprietary simulation state and perform a fresh, deterministic drape using our **XPBD Engine**.

---

## Implementation Layer: Hydration Services

All ingestion logic is encapsulated in **Hydration Services** within the `engine/ingestion/` module.

```typescript
interface HydrationService {
  canHandle(fileExtension: string): boolean;
  hydrate(fileData: Blob): Promise<ProfessionalPatternPiece[]>;
}

// Example: SeamlyIngestionService.ts
// 1. Parse XML -> 2. Resolve Formulas -> 3. Semantic Tagging -> 4. Graph Synthesis
```

This modular approach ensures that the core engine remains focused on **Semantic Design**, while the complexity of legacy formats is handled by isolated, extensible services.
