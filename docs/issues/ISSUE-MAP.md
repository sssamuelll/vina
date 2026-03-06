# Competitive Gap → Issue Cross-Reference Map

Every feature gap identified in [COMPETITIVE-GAP-ANALYSIS.md](../specs/COMPETITIVE-GAP-ANALYSIS.md) is mapped to a GitHub issue below. Issues marked with `*` are **new** (created by `scripts/create-roadmap-issues.sh`). Issues without `*` already existed.

---

## §1. 2D Pattern Design Tools

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| 3D Pen (draw on avatar) | #192 | Open |
| AI Pattern Drafter | *#241 | New |
| Trace Tool (over image) | *#242 | New |
| ~~Spiral pattern tool~~ | — | Deferred (niche) |

## §2. Sewing & Construction

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Pleats sewing/fold | *#226 (expands #191) | New |
| Fold arrangement | *#226 (expands #191) | New |
| Elastic simulation | *#226 | New |
| Seam puckering | *#238 | New |
| Seam bulk/thickness | *#238 | New |
| Tack/basting stitch | *#238 | New |

## §3. 3D Simulation & Draping

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| GPU-accelerated simulation | *#232 | New |
| Wind effect | *#239 | New |
| Steam/press tool | *#239 | New |
| Non-linear materials | *#240 | New |
| Simulation quality presets | *#239 | New |
| Freeze individual patterns | *#239 | New |
| Elastic simulation | *#226 | New |

## §4. Fabric & Material System

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| PBR material rendering | *#220 | New |
| Texture/diffuse maps | *#220 | New |
| Normal/specular maps | *#220 | New |
| SBSAR/Substance support | *#243 | New |
| Multilayered fabrics | *#244 | New |
| Knit swatch editor | *#245 | New |
| ~~Fabric scanner integration~~ | — | Out of scope (hardware) |

## §5. Trims & Hardware

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Buttons | #194 + *#224 | Existing + Expanded |
| Buttonholes | #194 + *#224 | Existing + Expanded |
| Zippers | #194 + *#224 | Existing + Expanded |
| Snaps/rivets | *#224 | New |
| Custom OBJ trims | *#224 | New |
| Elastic trims | *#224 | New |
| Buckles/rings | *#224 | New |
| Drawstrings | *#224 | New |

## §6. Colorway Management

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Multi-colorway system | *#221 | New |
| Per-colorway materials | *#221 | New |
| Pantone libraries | *#234 | New |
| Color palette import/export | *#234 | New |
| Linked vs unique items | *#221 | New |
| Quick colorway switch | *#221 | New |

## §7. Print & Graphics Placement

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Graphic placement (2D) | #34 + *#222 | Existing + Expanded |
| Graphic placement (3D) | #33 + *#222 | Existing + Expanded |
| All-over print (UV tiling) | *#222 | New |
| Cross-seam alignment | *#222 | New |
| AI/PSD artwork import | *#235 | New |
| 3D decal projection | #33 | Existing |
| Sublimation print workflow | *#222 | New |

## §8. Avatar System

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Morph target deformation | #8 + *#229 | Existing + Expanded |
| Soft/deformable avatars | *#246 | New |
| AI pose generator | *#247 | New |
| Avatar size sets | *#229 | New |
| Dress form avatars | *#248 | New |
| Full joint-based posing | *#229 | New |

## §9. Fit Analysis & Visualization

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Stress map | *#219 | New |
| Strain map | *#219 | New |
| Fit map (ease) | *#219 | New |
| Pressure map | *#219 | New |
| 3D measurement tapes | *#228 | New |
| 2D vs 3D comparison | *#228 | New |
| POM (point of measure) | *#228 | New |

## §10. Rendering & Visualization

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| PBR material rendering | *#220 + *#225 | New |
| HDRI environment maps | *#225 | New |
| Ray tracing / path tracing | *#237 | New |
| Turntable render | *#225 | New |
| Custom lighting rigs | *#225 | New |
| Ground shadow | *#225 | New |
| Transparent background | *#225 | New |
| High-res still export | *#225 | New |

## §11. Grading & Sizing

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Grade rule import/export (RUL) | *#227 | New |
| Nested size overlay view | *#227 | New |
| Grading review (3D per size) | *#227 | New |
| Per-point grading | *#227 | New |
| Graphic grading | *#227 | New |

## §12. Production Output

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Auto BOM | *#223 | New |
| Tech pack generation | *#223 | New |
| Nesting / marker making | #195 + *#233 | Existing + Expanded |
| Fabric consumption calc | *#233 | New |
| FBX export | #120 + *#231 | Existing + Expanded |
| glTF/GLB export | #120 + *#231 | Existing + Expanded |
| USD export | *#231 | New |
| Alembic animation cache | *#251 | New |
| Cost estimation | *#223 | New |

## §13. Animation

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Keyframe animation | *#230 | New |
| Camera animation | *#230 | New |
| Wind animation | *#230 | New |
| FBX motion import | *#251 | New |
| Animation video export | *#230 | New |

## §14. Collaboration

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Cloud review platform | #15 + *#236 | Existing + Expanded |
| 3D annotations | *#236 | New |
| PLM integration | *#249 | New |
| Team workspaces | *#236 | New |

## §15. API & Automation

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Headless CLI / batch mode | *#250 | New |
| Python/JS scripting API | *#250 | New |
| Batch processing | *#250 | New |

---

## §16. Gerber Feature Integration

| Gap Feature | Issue | Status |
|-------------|-------|--------|
| Walk Seam Verification | *#252 | New |
| Seam Corner Types (7+) | *#253 | New |
| Shrink/Stretch Compensation | *#254 | New |
| Piece Bookmarks (version compare) | *#255 | New |
| Multi-Dimensional Grading | *#256 (extends #227) | New |
| Fabric Codes on Pieces | *#257 | New |
| Accordion Pleats & Create Fold | *#258 (extends #226) | New |
| Pattern Wizard Macros | *#259 | New |
| Pre-Marking Rules | *#260 | New |
| Walk/Measure Along Curve | *#261 | New |
| DXF Wizard (Auto-Detect Format) | *#262 | New |
| Colorway Support (Gerber-style) | *#263 (extends #221) | New |
| Annotation Library | *#264 | New |
| Group Pieces | *#265 | New |
| Click'n'Go (Reduced Confirmations) | *#266 | New |
| Digital Print File Generation | *#267 | New |

See: [Gerber Integration Spec](../specs/GERBER-INTEGRATION-SPEC.md)

---

## Summary

| Category | Existing Issues | New Issues | Total |
|----------|----------------|------------|-------|
| Tier 1 (Critical) | #34, #33, #194 | #219, #220, #221, #222, #223, #224 | 9 |
| Tier 2 (Important) | #192, #191, #195, #120, #15, #8 | #225, #226, #227, #228, #229, #230, #231, #232, #233, #234, #235, #236, #237 | 19 |
| Tier 3 (Nice to Have) | — | #238, #239, #240, #241, #242, #243, #244, #245, #246, #247, #248, #249, #250, #251 | 14 |
| Gerber Integration | — | #252–#267 | 16 |
| **Total** | **9 existing** | **49 new** | **58** |

Every gap attribute in the competitive analysis is now tracked by at least one issue.
