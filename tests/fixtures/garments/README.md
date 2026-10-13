# Frozen garment fixtures (DXF import contracts)

This directory had five fixtures before Vectorizer Phase 0: four
Seamly2D-derived garments frozen as DXF bytes on **2026-06-05**, plus María's
external CAD export added on **2026-06-11**. The first four were the #506
dress-avatar DoD cases; their source geometry existed only as Seamly2D
conversions (`tools/seamly2d-converter/output/*.json`, deleted with the nuke).
Freezing them preserves the real-garment test substrate so the DoD connectivity
suite can be retargeted onto the DXF import path (backlog issue). María and the
new Vectorizer fixture retain their separate provenance below.

| File | Pieces | Provenance |
|---|---|---|
| `male_shirt.dxf` | 17 | Seamly2D `male_shirt` — Yoke, panels, pockets, cuffs, collars, plackets |
| `tshirt_test.dxf` | 5 | Seamly2D `tshirt_test` — Front/Back Bodice, Sleeves L/R, Neckband |
| `pajama_top_wrap2.dxf` | 9 | Seamly2D `pajama_top_wrap2` |
| `jacket1_52-176.dxf` | 5 | Seamly2D `jacket1_52-176` — Cyrillic piece names (index-prefixed*) |
| `maria_patrones_samuel_2M.dxf` | 5 | **María (patternmaker), 2026-06-11** — real external CAD export (AC1009, block `PATRONES PARA SAMUEL-2_M`): front/back bodices, 2 sleeves, strip. NOT Seamly2D-derived — this is the canonical real-pattern substrate; the user mandated all integration-level verification use it (`seam-parity-replay.spec.ts`). |
| `vectorizer_jacket_M.dxf` | 7 | Regenerated Phase 0 Vectorizer output (`patent_pattern/jacket_sizes/jacket_M.dxf`), mechanically copied into this fixture set: front/back panels, sleeves L/R, collar, waistband. |

**License.** The four Seamly2D-derived fixtures come from Seamly2D sample
patterns. Seamly2D is distributed under the GNU GPL v3, and these files are not
covered by Vina's MIT license (see [`THIRD-PARTY-NOTICES.md`](../../../THIRD-PARTY-NOTICES.md)).

**How the four Seamly2D-derived fixtures were produced** (one-shot script,
deleted after running — it imported modules that died with the nuke): for each
pattern JSON, replicate the `loadSeamlyPattern` pipeline —
`applyMeasMapping` + `deriveMeasurements`
over the default avatar measurements (height 180, chest 96, waist 82, hips 96,
shoulder 44, armLength 64, inseam 82) → `adaptSeamlyPattern` →
`buildPieceWithOffset` per construction piece → cm→mm scale → x-offset
placement → `applyClassification` + `detectSemanticEdges` → the `loadProject`
reducer (for the app's duplicate-name enrichment) → `generateDXFAAMA` →
those four byte streams. Each was round-trip-verified:
`importDXFContent` re-imports the exact piece count.

*\*Jacket pieces are prefixed `1..5` for readability. `sanitizeBlockName`
strips non-ASCII to `_`, so names like Cyrillic ones would sanitize to the
same string; the exporter now disambiguates such collisions with a numeric
suffix (`assignUniqueBlockNames`, #848), so the prefix is no longer a
correctness workaround — just keeps the fixture block names legible.*

María's tracked fixture is the original DXF content normalized only from CRLF to
LF by `.gitattributes`; no geometry or DXF data was rewritten. Its SHA-256 is
`C9E0EC92E6C10DE5FF0CF11AC81FFAE04DB2AE9F477A4746701779ACF403E4E2`.

**Consumers**: `src/utils/dxf/__tests__/realCadImport.contract.test.ts` imports
both the María and Vectorizer fixtures as real-CAD contracts. María is also
consumed by `anchorRoles.maria.test.ts`, `cdtMesher.maria.test.ts`, the
`autoSew` María contracts, and the `mariaShirt.m0/m4` regression suites. Load
with `importDXFContent(readFileSync(path, 'utf-8'))`.
Note the DXF import path does NOT auto-sew (by design): connectivity tests
must invoke `autoSew`/`autoDetectSeams` explicitly after import.
