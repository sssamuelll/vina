# Competitive Gap → Issue Cross-Reference Map

Every feature gap identified in [COMPETITIVE-GAP-ANALYSIS.md](../specs/COMPETITIVE-GAP-ANALYSIS.md) is mapped to a GitHub issue below. Issues marked with `*` are **new** (created from local specs). Issues without `*` already existed.

> **Note:** Local doc numbers (219–270) map to GitHub issues #221–#272 due to PR numbering offset.

---

## §1. 2D Pattern Design Tools

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| 3D Pen (draw on avatar) | #192 | Open |
| AI Pattern Drafter | *#243 | New |
| Trace Tool (over image) | *#244 | New |
| ~~Spiral pattern tool~~ | — | Deferred (niche) |

## §2. Sewing & Construction

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Pleats sewing/fold | *#228 (expands #191) | New |
| Fold arrangement | *#228 (expands #191) | New |
| Elastic simulation | *#228 | New |
| Seam puckering | *#240 | New |
| Seam bulk/thickness | *#240 | New |
| Tack/basting stitch | *#240 | New |

## §3. 3D Simulation & Draping

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| GPU-accelerated simulation | *#234 | New |
| Wind effect | *#241 | New |
| Steam/press tool | *#241 | New |
| Non-linear materials | *#242 | New |
| Simulation quality presets | *#241 | New |
| Freeze individual patterns | *#241 | New |
| Elastic simulation | *#228 | New |

## §4. Fabric & Material System

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| PBR material rendering | *#222 | New |
| Texture/diffuse maps | *#222 | New |
| Normal/specular maps | *#222 | New |
| SBSAR/Substance support | *#245 | New |
| Multilayered fabrics | *#246 | New |
| Knit swatch editor | *#247 | New |
| ~~Fabric scanner integration~~ | — | Out of scope (hardware) |

## §5. Trims & Hardware

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Buttons | #194 + *#226 | Existing + Expanded |
| Buttonholes | #194 + *#226 | Existing + Expanded |
| Zippers | #194 + *#226 | Existing + Expanded |
| Snaps/rivets | *#226 | New |
| Custom OBJ trims | *#226 | New |
| Elastic trims | *#226 | New |
| Buckles/rings | *#226 | New |
| Drawstrings | *#226 | New |

## §6. Colorway Management

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Multi-colorway system | *#223 | New |
| Per-colorway materials | *#223 | New |
| Pantone libraries | *#236 | New |
| Color palette import/export | *#236 | New |
| Linked vs unique items | *#223 | New |
| Quick colorway switch | *#223 | New |

## §7. Print & Graphics Placement

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Graphic placement (2D) | #34 + *#224 | Existing + Expanded |
| Graphic placement (3D) | #33 + *#224 | Existing + Expanded |
| All-over print (UV tiling) | *#224 | New |
| Cross-seam alignment | *#224 | New |
| AI/PSD artwork import | *#237 | New |
| 3D decal projection | #33 | Existing |
| Sublimation print workflow | *#224 | New |

## §8. Avatar System

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Morph target deformation | #8 + *#231 | Existing + Expanded |
| IK solver | *#270 | New |
| Apply morph weights to mesh | *#271 | New |
| Collision mesh auto-update | *#272 | New |
| Soft/deformable avatars | *#248 | New |
| AI pose generator | *#249 | New |
| Avatar size sets | *#231 | New |
| Dress form avatars | *#250 | New |
| Full joint-based posing | *#231 | New |
| ~~MakeHuman morph targets~~ | — | Deferred (covered by #271 + standard GLB/FBX import) |

## §9. Fit Analysis & Visualization

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Stress map | *#221 | New |
| Strain map | *#221 | New |
| Fit map (ease) | *#221 | New |
| Pressure map | *#221 | New |
| 3D measurement tapes | *#230 | New |
| 2D vs 3D comparison | *#230 | New |
| POM (point of measure) | *#230 | New |

## §10. Rendering & Visualization

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| PBR material rendering | *#222 + *#227 | New |
| HDRI environment maps | *#227 | New |
| Ray tracing / path tracing | *#239 | New |
| Turntable render | *#227 | New |
| Custom lighting rigs | *#227 | New |
| Ground shadow | *#227 | New |
| Transparent background | *#227 | New |
| High-res still export | *#227 | New |

## §11. Grading & Sizing

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Grade rule import/export (RUL) | *#229 | New |
| Nested size overlay view | *#229 | New |
| Grading review (3D per size) | *#229 | New |
| Per-point grading | *#229 | New |
| Graphic grading | *#229 | New |

## §12. Production Output

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Auto BOM | *#225 | New |
| Tech pack generation | *#225 | New |
| Nesting / marker making | #195 + *#235 | Existing + Expanded |
| Fabric consumption calc | *#235 | New |
| FBX export | #120 + *#233 | Existing + Expanded |
| glTF/GLB export | #120 + *#233 | Existing + Expanded |
| USD export | *#233 | New |
| Alembic animation cache | *#253 | New |
| Cost estimation | *#225 | New |

## §13. Animation

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Keyframe animation | *#232 | New |
| Camera animation | *#232 | New |
| Wind animation | *#232 | New |
| FBX motion import | *#253 | New |
| Animation video export | *#232 | New |

## §14. Collaboration

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Cloud review platform | #15 + *#238 | Existing + Expanded |
| 3D annotations | *#238 | New |
| PLM integration | *#251 | New |
| Team workspaces | *#238 | New |

## §15. API & Automation

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Headless CLI / batch mode | *#252 | New |
| Python/JS scripting API | *#252 | New |
| Batch processing | *#252 | New |

---

## §16. Gerber Feature Integration

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Walk Seam Verification | *#254 | New |
| Seam Corner Types (7+) | *#255 | New |
| Shrink/Stretch Compensation | *#256 | New |
| Piece Bookmarks (version compare) | *#257 | New |
| Multi-Dimensional Grading | *#258 (extends #229) | New |
| Fabric Codes on Pieces | *#259 | New |
| Accordion Pleats & Create Fold | *#260 (extends #228) | New |
| Pattern Wizard Macros | *#261 | New |
| Pre-Marking Rules | *#262 | New |
| Walk/Measure Along Curve | *#263 | New |
| DXF Wizard (Auto-Detect Format) | *#264 | New |
| Colorway Support (Gerber-style) | *#265 (extends #223) | New |
| Annotation Library | *#266 | New |
| Group Pieces | *#267 | New |
| Click'n'Go (Reduced Confirmations) | *#268 | New |
| Digital Print File Generation | *#269 | New |

See: [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md)

---

## Summary

| Category | Existing Issues | New Issues | Total |
|----------|----------------|------------|-------|
| Tier 1 (Critical) | #34, #33, #194 | #221, #222, #223, #224, #225, #226 | 9 |
| Tier 2 (Important) | #192, #191, #195, #120, #15, #8 | #227, #228, #229, #230, #231, #232, #233, #234, #235, #236, #237, #238, #239 | 19 |
| Tier 3 (Nice to Have) | — | #240, #241, #242, #243, #244, #245, #246, #247, #248, #249, #250, #251, #252, #253 | 14 |
| Gerber Integration | — | #254–#269 | 16 |
| Avatar High-Impact | — | #270, #271, #272 | 3 |
| **Total** | **9 existing** | **52 new** | **61** |

Every gap attribute in the competitive analysis is now tracked by at least one issue.
