# Frozen garment fixtures (DXF AAMA)

Real multi-piece garment patterns, frozen as DXF bytes on **2026-06-05** —
PASO 0 of the Seamly2D removal (council plan, same date). These four garments
were the #506 dress-avatar DoD cases; their source geometry existed only as
Seamly2D conversions (`tools/seamly2d-converter/output/*.json`, deleted with
the nuke). Freezing them preserves the real-garment test substrate so the DoD
connectivity suite can be retargeted onto the DXF import path (backlog issue).

| File | Pieces | Provenance |
|---|---|---|
| `male_shirt.dxf` | 17 | Seamly2D `male_shirt` — Yoke, panels, pockets, cuffs, collars, plackets |
| `tshirt_test.dxf` | 5 | Seamly2D `tshirt_test` — Front/Back Bodice, Sleeves L/R, Neckband |
| `pajama_top_wrap2.dxf` | 9 | Seamly2D `pajama_top_wrap2` |
| `jacket1_52-176.dxf` | 5 | Seamly2D `jacket1_52-176` — Cyrillic piece names (index-prefixed*) |
| `maria_patrones_samuel_2M.dxf` | 5 | **María (patternmaker), 2026-06-11** — real external CAD export (AC1009, block `PATRONES PARA SAMUEL-2_M`): front/back bodices, 2 sleeves, strip. NOT Seamly2D-derived — this is the canonical real-pattern substrate; the user mandated all integration-level verification use it (`seam-parity-replay.spec.ts`). |

**How they were produced** (one-shot script, deleted after running — it
imported modules that died with the nuke): for each pattern JSON, replicate
the `loadSeamlyPattern` pipeline — `applyMeasMapping` + `deriveMeasurements`
over the default avatar measurements (height 180, chest 96, waist 82, hips 96,
shoulder 44, armLength 64, inseam 82) → `adaptSeamlyPattern` →
`buildPieceWithOffset` per construction piece → cm→mm scale → x-offset
placement → `applyClassification` + `detectSemanticEdges` → the `loadProject`
reducer (for the app's duplicate-name enrichment) → `generateDXFAAMA` →
these bytes. Each file was round-trip-verified: `importDXFContent` re-imports
the exact piece count.

*\*Jacket pieces are prefixed `1..5` because `sanitizeBlockName` strips
non-ASCII to `_`, making Cyrillic block names collide (latent exporter bug,
filed separately). Digits survive sanitization, so the prefix keeps DXF
blocks unique while preserving the original names.*

**Consumers**: none yet — these exist for the DoD-over-DXF retarget
(post-nuke backlog). Load with `importDXFContent(readFileSync(path, 'utf-8'))`.
Note the DXF import path does NOT auto-sew (by design): connectivity tests
must invoke `autoSew`/`autoDetectSeams` explicitly after import.
