# OpenClo vs Gerber AccuMark — Direct Comparison

> Date: 2026-03-06
> Gerber AccuMark V2025.1 (Lectra) vs OpenClo.ai current

Gerber AccuMark is a **production-focused** 2D CAD + cutting room suite. Unlike CLO3D/Browzwear (which are design-first 3D tools), Gerber's strength is in industrial pattern engineering, grading, marker making, and cutting integration. Its 3D capabilities are limited (powered by Browzwear VStitcher integration).

---

## Feature Comparison

### 1. Pattern Design (2D)

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Freeform point/line drawing | Yes | Yes | Both have full pen/polygon tools |
| Rectangle/circle/conic primitives | Yes | Yes | Gerber: conics replace corners with arcs |
| Bezier/spline curves | Yes | Yes | Gerber: "Edit Line with Handles" bezier mode |
| Split piece (7 methods) | Yes | Yes | Gerber: on line, point-to-point, H, V, etc. |
| Combine/merge pieces | Yes | Yes | Gerber: option to convert merge to internal line |
| Add/manipulate darts | Yes | Yes | Gerber: fisheye dart, balanced/one-sided resize, pivot |
| Mirror/copy/flip pieces | Yes | Yes | Gerber: X/Y/XY flip + set/rotate |
| Seam allowance (per-edge) | Yes | Yes | Gerber: define seam, swap sew/cut, auto-update seam |
| Seam corner types (7+) | Yes | Partial | **Gerber has** — mitered, double mitered, slant, envelope, squared, match, trim mirrored |
| Internal lines/shapes | Yes | Yes | |
| Notch tool (5+ types) | Yes | Yes | Gerber: add group on line, reference notch, P-Notch table |
| Grainline with orientation symbol | Yes | Yes | |
| Trace piece from existing | Yes | Yes | Gerber: SHIFT+F3 outline area → new piece |
| Drill holes | Yes | No | **Gerber has** — placement markers for pockets, buttons |
| Piece numbering/annotation | Yes | Partial | Gerber: annotation library (V16.1) with shared templates |
| Accordion pleats | Yes | No | **Gerber has** — auto pre-folded pattern for 3D |
| Create fold (collars/cuffs) | Yes | No | **Gerber has** — fold/crease lines |
| Tapered fullness | Yes | No | **Gerber has** — fullness extending to internal line |
| Shrink/stretch compensation | Yes | No | **Gerber has** — linear or % shrink per fabric; auto-updates grades |
| Piece digitizing from table | Yes | No | **Gerber has** via AccuScan |
| Clip image tool | Yes | No | **Gerber has** (V16.0) — fill segments with images across all sizes |
| Image placement on patterns | Yes | No | **Gerber has** — fabric fills, trim images (PNG/JPG/TIF/BMP) |
| Adobe Illustrator integration | Yes | No | **Gerber has** — import/modify AI graphics in CAD |
| Trace from scanned image | Yes | No | **Gerber has** — trace over scanned images |
| Pattern Wizard macros | Yes | No | **Gerber has** — record/replay; 3 custom groups × 25 scripts (V2025.1) |
| Piece bookmarks | Yes | No | **Gerber has** — save/compare piece versions (V2024.1) |
| Walk seam verification | Yes | No | **Gerber has** — verify seam matching between pieces |
| Click'n'Go preference | Yes | No | **Gerber has** — reduces confirmation clicks |
| Group pieces (V2025.1) | Yes | No | **Gerber has** — batch PDS actions on grouped pieces |
| Colorway support | Yes | No | **Gerber has** — multiple color combos without duplicating models |
| Digital print file generation | Yes | No | **Gerber has** — automated with batch processing |
| Linked editing (symmetry) | No | Yes | **OpenClo has** — automatic mirrored piece editing |
| AI copilot for patternmaking | No | Yes | **OpenClo has** — natural language pattern commands |
| Constraint-based geometry | No | Yes | **OpenClo has** — parametric relationships |
| Real-time parametric sliders | No | Yes | **OpenClo has** — adjust dimensions via sliders |
| Real-time 2D↔3D live link | No | Yes | **OpenClo has** — edit pattern, see 3D update instantly |

### 2. Grading & Sizing

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Multi-size grading | Yes | Yes | |
| Per-point grade rules | Yes | Partial | Gerber: full point-by-point rules |
| Rule table editor | Yes | Partial | Gerber: industrial RUL format |
| Multi-dimensional grading | Yes | No | **Gerber has** — grade across multiple body dimensions simultaneously |
| Graded nest (all sizes overlay) | Yes | No | **Gerber has** — standard in PDS |
| Import/export RUL files | Yes | No | **Gerber has** — Gerber, Lectra, Optitex interop |
| Alteration rules + grading combo | Yes | No | **Gerber has** — alter graded sizes independently |
| Size table management | Yes | No | **Gerber has** — tabular size management |
| Growth/shrinkage tables | Yes | No | **Gerber has** — fabric shrinkage compensation per size |
| Made-to-Measure (MTM) | Yes | No | **Gerber has** — full MTM automation system |

### 3. Marker Making / Nesting

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Easy Marking (interactive) | Yes | No | **Gerber has** — Marker Wizard + floating toolbox |
| Step/tilt/flip/rotate tools | Yes | No | **Gerber has** — precise piece nudging (=, [, ], ' keys) |
| Pre-Marking Rules | Yes | No | **Gerber has** — automated placement before manual marking |
| Rule Editor | Yes | No | **Gerber has** — define piece placement relative to others |
| Combine markers (up to 99) | Yes | No | **Gerber has** — up to 20,000 pieces / 1,000 bundles |
| AccuNest PE (single-core) | Yes | No | **Gerber has** — multi-algorithm nesting engine |
| AccuNest MC (multi-core) | Yes | No | **Gerber has** — up to 2% better utilization than PE |
| Cloud nesting | Yes | No | **Gerber has** — Quick + Flex modes, large-volume simultaneous |
| NESTERpack | Yes | No | **Gerber has** — shorten markers with auto rotate/flip/tilt |
| Partial placement + cloud finish | Yes | No | **Gerber has** — manual critical pieces, cloud nests the rest |
| Sectional markers | Yes | No | **Gerber has** — split into sections for staging |
| Shade zone nesting | Yes | No | **Gerber has** — zones for fabric shade variations |
| Bundle markers | Yes | No | **Gerber has** — group pieces by bundle for cutting |
| Marker info bar | Yes | No | **Gerber has** — utilization (CU/TU), waste (CW/TW) |
| Overlap control (OL tolerance) | Yes | No | **Gerber has** — configurable; negative = add spacing |
| Buffer zones (rounded corners) | Yes | No | **Gerber has** — segment/classic buffer methods |
| Tilt allowances per piece | Yes | No | **Gerber has** — configurable grain deviation |
| Stripe/plaid matching | Yes | No | **Gerber has** — 0/1/2+ match lines, cross-piece matching |
| Matching tables in orders | Yes | No | **Gerber has** — category-to-category point matching |
| Defect avoidance | Yes | No | **Gerber has** — predefine unusable areas on material |
| Splice zones | Yes | No | **Gerber has** — manage fabric roll splices |
| Multi-fabric markers | Yes | No | **Gerber has** — different fabrics in same marker |
| Roll width/length config | Yes | No | **Gerber has** |
| Costing vs production markers | Yes | No | **Gerber has** — fast costing vs optimized production |
| Marker plotting | Yes | No | **Gerber has** — direct output to plotters |
| Basic nesting | Partial (#195) | Partial | OpenClo: planned basic auto-nesting |

### 4. 3D Simulation

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Cloth physics simulation | Yes (Avametric engine) | Yes (XPBD) | Gerber: licensed engine; OpenClo: native WASM |
| Real-time simulation | Yes | Yes | **OpenClo better** — native, no third-party license |
| Self-collision | Via VStitcher | Yes | |
| Fabric presets library | 42 presets (Lectra Labs) | 32+ presets | Gerber: lab-tested mechanical properties |
| KES-F fabric coefficients | Yes | No | **Gerber has** — precise textile test data input |
| Fabric scanner support (Vizoo/xRite) | Yes | No | **Gerber has** — optical property capture from hardware |
| 3D stitching in avatar window | Yes | No | **Gerber has** — create sew relations directly in 3D |
| Elastic lines on perimeter | Yes | Partial | **Gerber has** — indicate elastic gathering for 3D |
| Mark-up/drawing on 3D | Yes | No | **Gerber has** — draw on 3D for pattern adjustments |
| AR visualization (Avametric) | Yes | No | **Gerber has** — augmented reality garment try-on |
| Image Edition in 3D | Yes | No | **Gerber has** — graphic design placement reflected 2D↔3D |
| Collision bodies (multi-mesh) | No | Yes | **OpenClo has** — import any mesh as collision body |
| Simulation snapshots (A/B/C) | No | Yes | **OpenClo has** — compare drape states |
| Air drag / anisotropic damping | No | Yes | **OpenClo has** — per-direction air resistance |
| WASM + JS fallback | No | Yes | **OpenClo has** — works on any browser, any OS |
| BVH triangle collision | No | Yes | **OpenClo has** — spatial hash + BVH collision pipeline |

### 5. Avatar System

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Parametric body editing | Yes | Yes | |
| ASTM-based size avatars | Yes | Yes | |
| Import custom avatars (OBJ) | Yes | Yes | |
| Graded avatar sets | Yes | No | **Gerber has** — avatar per size in grade range |
| Avatar Editor application | Yes | Partial | Gerber: standalone app for custom avatars |
| Skin color/texture | Yes | No | **Gerber has** — recolor avatars |
| Extended size range (US 24W+) | Yes | No | **Gerber has** — inclusive sizing |
| Hair styles (long/short) | Yes | No | **Gerber has** — cosmetic avatar options |
| Body scanner integration | Yes | No | **Gerber has** — TC2 scanner, 3D body scan import |
| Alvanon avatar support | Yes | No | **Gerber has** — industry-standard fit forms |
| Pose library | Yes | Partial | Gerber: A-pose, contra, driving poses |

### 6. Data Management (AccuMark Explorer)

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Storage area management | Yes | No | **Gerber has** — SQL-backed storage areas |
| Model/piece/marker database | Yes | No | **Gerber has** — relational data management |
| Search/find across storage | Yes | No | **Gerber has** — search by category, description, fabric code |
| Batch operations (copy/move/delete) | Yes | No | **Gerber has** — bulk data operations |
| Piece categories & descriptions | Yes | No | **Gerber has** — mandatory piece classification |
| Fabric code assignment | Yes | No | **Gerber has** — assign fabric codes to pieces |
| Model preview (sketch + pieces) | Yes | No | **Gerber has** — dual preview panes |
| Report generation | Yes | No | **Gerber has** — data reports from Explorer |
| Annotation library | Yes | No | **Gerber has** — shared annotation templates |
| SQL Server integration | Yes | No | **Gerber has** — enterprise database storage |
| Browser-based access | No | Yes | **OpenClo has** — web app, no install needed |
| IndexedDB local persistence | No | Yes | **OpenClo has** — client-side storage |

### 7. Digitizing (AccuScan)

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Scan physical patterns | Yes | No | **Gerber has** — flatbed scanner integration |
| Auto-trace scanned images | Yes | No | **Gerber has** — automatic edge detection |
| Digitizing table support | Yes | No | **Gerber has** — hardware digitizing tables |
| Manual digitize from image | Yes | No | **Gerber has** — point-by-point on scanned image |
| Notch/drill detection | Yes | No | **Gerber has** — auto-detect marks on scan |
| DXF import as alternative | Yes | Yes | Both support DXF pattern import |
| AAMA/ASTM import | Yes | Yes | Both support industrial formats |

### 8. Production Planning (AccuPlan)

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Cut order planning | Yes | No | **Gerber has** — multi-order planning together |
| Spread planning | Yes | No | **Gerber has** — plan fabric lay-up sequences |
| Time Plan tool | Yes | No | **Gerber has** — schedule by location, date, time |
| Working hours per location | Yes | No | **Gerber has** — define shifts per production site |
| Visualize workload | Yes | No | **Gerber has** — workload heatmap across locations |
| Fabric roll management | Yes | No | **Gerber has** — plan based on available rolls |
| Cutting table availability | Yes | No | **Gerber has** — coordinate across tables |
| Digital cut tickets | Yes | No | **Gerber has** — barcodes for spreader/cutter retrieval |
| Production Tracker | Yes | No | **Gerber has** — track orders from CAD to cutting |
| Fabric consumption calc (V2025.1) | Yes | No | **Gerber has** — monitor costs throughout development |
| Multi-spread cut tickets | Yes | No | **Gerber has** — XL125-Spreader section recognition |
| Batch cut ticket regeneration | Yes | No | **Gerber has** — reprocess existing markers |
| Integration with ERP | Yes | No | **Gerber has** — connect to factory ERP systems |
| Up to 80% productivity boost | Yes | No | **Gerber claims** vs manual planning |

### 9. Made-to-Measure (MTM)

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Individual body measurement input | Yes | No | **Gerber has** — from tape/scanner/web |
| Automatic pattern alteration | Yes | No | **Gerber has** — rule-based pattern modification |
| Alteration rules engine | Yes | No | **Gerber has** — define how measurements affect patterns |
| Auto marker + cut generation | Yes | No | **Gerber has** — full automation pipeline |
| Style selection per order | Yes | No | **Gerber has** — choose style options |
| Body scanner integration | Yes | No | **Gerber has** — TC2 and other scanner input |
| Mass customization workflow | Yes | No | **Gerber has** — high-volume individual garments |

### 10. Automation & Scripting

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Pattern Wizard macros | Yes | No | **Gerber has** — recorded script sequences |
| Script groups (up to 3 custom) | Yes | No | **Gerber has** — organize macros in groups |
| Batch processing | Yes | No | **Gerber has** — bulk operations via scripts |
| Queue submission | Yes | No | **Gerber has** — submit jobs to processing queue |
| AI copilot tool execution | No | Yes | **OpenClo has** — LLM-driven tool execution |
| Planner/Executor/Reasoner | No | Yes | **OpenClo has** — bridge architecture for AI operations |
| Skill marketplace | No | Yes | **OpenClo has** — extensible skill plugins |

### 11. Cutting Integration

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Direct cutter output | Yes | No | **Gerber has** — GERBERcutter Z1, Paragon, Atria |
| Cut data generation | Yes | No | **Gerber has** — DXF/HPGL cut files |
| Spreader integration | Yes | No | **Gerber has** — automated fabric spreading |
| Cut order queue | Yes | No | **Gerber has** — production job queue |
| Plotter output | Yes | No | **Gerber has** — direct print to large-format plotters |
| Laser/knife cutter support | Yes | No | **Gerber has** — multi-ply + single-ply cutting |

### 12. File Formats & Interoperability

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| DXF (AAMA/ASTM) | Yes | Yes | Both: industry-standard pattern exchange |
| Standard DXF (AutoCAD) | Yes | Yes | |
| Gerber native (.zip storage) | Yes | No | Gerber proprietary packaged format |
| PDF/AI export | Yes | Yes | |
| RUL (grade rules) | Yes | No | **Gerber has** — import/export grade rules |
| TIIP format | Yes | No | **Gerber has** — legacy interop |
| IGES format | Yes | No | **Gerber has** — CAD interop |
| HPGL (plotter) | Yes | No | **Gerber has** — direct plotter output |
| MDL (Lectra Versalis) | Yes | No | **Gerber has** — Lectra cutter + Design Concept |
| Data Conversion Utility (DCU) | Yes | No | **Gerber has** — import from Assyst, Lectra, Investronica |
| DXF Wizard auto-detection | Yes | No | **Gerber has** — auto-identifies DXF file type (V10.4+) |
| OBJ/FBX 3D export | Via VStitcher | Yes | |
| CSV measurements | Yes | Partial | |
| AccuMark ZIP export | Yes | No | **Gerber has** — packaged with notes, charts, 3D, rules |

### 13. Collaboration & Cloud

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Kubix Link PLM integration | Yes | No | **Gerber has** — Lectra PLM connection |
| Cloud nesting (AccuNest Cloud) | Yes | No | **Gerber has** — offload nesting to cloud |
| Subscription licensing | Yes | Yes (free) | |
| Tech pack export to PLM | Yes | No | **Gerber has** — auto-generate for suppliers |
| Browser-based access | No | Yes | **OpenClo has** — full app runs in browser |
| Real-time collaboration | No | Planned | OpenClo: cloud review planned (#236) |
| AI copilot chat | No | Yes | **OpenClo has** — conversational assistant |

### 14. Rendering & Visualization

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| 3D garment rendering | Via VStitcher | Yes (R3F) | |
| Fabric texture preview | Via VStitcher | Planned (#220) | |
| AR visualization | Yes (Avametric app) | No | **Gerber has** — augmented reality try-on |
| Real-time 3D viewport | Via VStitcher | Yes | **OpenClo better** — native in-browser |
| Photorealistic rendering | No | Planned (#237) | Neither has production-ready render |

---

## What Gerber Has That OpenClo Doesn't

### Production & Manufacturing (Gerber's core strength)

| Gap | Impact | Notes |
|-----|--------|-------|
| **AccuNest industrial nesting** | Critical for manufacturing | AI-optimized, cloud-capable, stripe/plaid matching |
| **AccuPlan production planning** | Critical for factories | Cut orders, spreads, scheduling, ERP integration |
| **AccuScan digitizing** | Important for legacy patterns | Scan physical patterns to digital |
| **Made-to-Measure (MTM)** | Important for custom tailoring | Full automation: body scan → pattern → cut |
| **Cutting machine integration** | Critical for factories | Direct output to GERBERcutter hardware |
| **Queue Submit / job management** | Important for production | Batch job processing pipeline |
| **SQL data management** | Important for enterprise | AccuMark Explorer with SQL backend |
| **Kubix Link PLM** | Important for enterprise | Lectra ecosystem integration |

### Pattern Engineering

| Gap | Impact | Notes |
|-----|--------|-------|
| **Multi-dimensional grading** | High | Grade across bust + height + hip simultaneously |
| **Pattern Wizard macros** | Medium | Record and replay pattern operations |
| **Piece bookmarks** | Medium | Save/compare piece versions |
| **Drill holes** | Low | Placement markers for pockets/buttons |
| **Fullness distribution** | Medium | Redistribute ease along edges |
| **Annotation library** | Low | Shared annotation templates |
| **Growth/shrinkage tables** | Medium | Compensate for fabric shrinkage per size |

### Digitizing & Legacy

| Gap | Impact | Notes |
|-----|--------|-------|
| **Physical pattern scanning** | Medium | Flatbed scanner integration |
| **Digitizing table support** | Low | Hardware digitizing tables |
| **Auto-trace from scan** | Medium | Edge detection on scanned images |

---

## What OpenClo Has That Gerber Doesn't

### Technology Advantages

| Feature | Impact | Notes |
|---------|--------|-------|
| **Browser-native (no install)** | Very High | Works on any device with a browser |
| **Native XPBD cloth simulation** | Very High | Real-time physics in WASM, not via third-party |
| **AI Copilot (LLM-powered)** | Very High | Natural language pattern making, error recovery |
| **Universal collision bodies** | High | Any imported mesh acts as collision body |
| **Simulation snapshots (A/B/C)** | Medium | Compare drape states instantly |
| **Constraint-based geometry** | High | Parametric relationships between pattern elements |
| **Parametric sliders** | High | Real-time dimension adjustment via UI controls |
| **Linked/symmetric editing** | Medium | Edit one piece, mirror updates automatically |
| **Skill marketplace** | Medium | Extensible plugin system for copilot |
| **Open/free** | Very High | No $5k+/year license cost |
| **Modern stack (React/Three.js)** | High | Easy to extend, web-standard technologies |
| **Self-collision detection** | Medium | Fabric-to-fabric collision in simulation |
| **Air drag simulation** | Low | Anisotropic air resistance |
| **Anisotropic stretch/bend** | Medium | Per-direction fabric behavior (warp/weft/shear) |

### Design Workflow

| Feature | Impact | Notes |
|---------|--------|-------|
| **AI-driven pattern generation** | High | "Make a bodice with 4cm ease" → pattern |
| **Real-time 2D↔3D link** | High | Edit pattern, see 3D update instantly |
| **Copilot error recovery** | Medium | AI reasons about failures and retries |
| **Bridge architecture** | Medium | Planner + Executor + Reasoner for reliable AI ops |

---

## Strategic Summary

| Dimension | Gerber AccuMark | OpenClo |
|-----------|:-:|:-:|
| **Primary strength** | Production/manufacturing | Design/prototyping |
| **Target user** | Factory/production team | Designer/pattern maker |
| **Deployment** | Desktop (Windows) | Browser (any device) |
| **3D capability** | Via VStitcher (licensed) | Native XPBD solver |
| **AI/ML features** | AccuNest optimization only | Full AI copilot + skills |
| **Cutting integration** | Deep (hardware ecosystem) | None |
| **Nesting quality** | Industry-leading | Basic (planned) |
| **Grading depth** | Industry-leading (MDG + MTM) | Basic (XS-XXL) |
| **Cost** | $5,000–15,000+/year | Free/open |
| **Learning curve** | Steep (weeks) | Moderate (hours) |
| **Ecosystem lock-in** | High (Lectra hardware) | Low (open formats) |

### Key Insight

Gerber AccuMark and OpenClo serve **different segments of the value chain**:

- **Gerber** = Production engine. Optimized for factories: pattern → grade → nest → cut → sew. Weak on 3D and design creativity.
- **OpenClo** = Design engine. Optimized for designers: sketch → simulate → iterate → present. Weak on production workflow.

The overlap is in **2D pattern design and grading** — where both compete directly. The non-overlapping areas represent **partnership or integration opportunities** rather than direct competition.

### Gerber Feature Integration Plan

We are implementing **16 Gerber-inspired features** (#252–#267) to make OpenClo patterns production-ready. See [GERBER-INTEGRATION-SPEC.md](./GERBER-INTEGRATION-SPEC.md) for full details.

| Sprint | Features | Goal |
|--------|----------|------|
| Sprint 1 | #252 Walk Seam, #257 Fabric Codes, #253 Seam Corners | Foundation — data model + QA tools |
| Sprint 2 | #254 Shrink Compensation, #255 Bookmarks, #261 Curve Measure | Pattern engineering tools |
| Sprint 3 | #256 Multi-Dim Grading, #258 Pleats & Folds | Complex geometry + grading overhaul |
| Sprint 4 | #259 Macros, #262 DXF Wizard, #263 Colorways | Automation + interop |
| Sprint 5 | #260 Pre-Marking, #264 Annotations, #265 Groups | Production metadata |
| Sprint 6 | #266 Click'n'Go, #267 Print File Gen | UX polish + output |

### Interoperability Strategy

In addition to the 16 integrated features, OpenClo maintains **interoperability** with Gerber's ecosystem:

1. **DXF/AAMA export** → Already done. Gerber can import OpenClo patterns.
2. **RUL grade rule export** → Add to #227. Let Gerber users import OpenClo grading.
3. **Marker-ready output** → Export patterns with fabric codes (#257) and grain direction that Gerber's AccuNest can consume.
4. **MTM API integration** → OpenClo designs + Gerber MTM automation = end-to-end custom tailoring.
5. **DXF Wizard** (#262) → Auto-detect Gerber DXF format on import for seamless round-trip.
