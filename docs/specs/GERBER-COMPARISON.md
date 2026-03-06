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
| Rectangle/circle primitives | Yes | Yes | |
| Bezier/spline curves | Yes | Yes | Gerber uses "smooth" points |
| Split/combine pieces | Yes | Yes | Scissors + merge tools |
| Add/manipulate darts | Yes | Yes | |
| Mirror/copy pieces | Yes | Yes | |
| Seam allowance (per-edge) | Yes | Yes | Gerber: "shrink/grow" |
| Internal lines/shapes | Yes | Yes | |
| Notch tool (multiple types) | Yes | Yes | Both have 5+ notch types |
| Grainline | Yes | Yes | |
| Drill holes | Yes | No | **Gerber has** — placement markers for pockets, buttons |
| Piece numbering/annotation | Yes | Partial | Gerber has annotation library |
| Pleats/tucks | Yes | No | **Gerber has** — pleat creation tools |
| Fullness distribution | Yes | No | **Gerber has** — redistribute ease along edges |
| Piece digitizing from table | Yes | No | **Gerber has** via AccuScan |
| Clip image tool | Yes | No | **Gerber has** — fill segments with images using internal lines |
| Trace from image | Yes | No | **Gerber has** — trace over scanned images |
| Macro recording | Yes | No | **Gerber has** — Pattern Wizard macros |
| Piece bookmarks | Yes | No | **Gerber has** — save/compare piece versions |
| Linked editing (symmetry) | No | Yes | **OpenClo has** — automatic mirrored piece editing |
| AI copilot for patternmaking | No | Yes | **OpenClo has** — natural language pattern commands |
| Constraint-based geometry | No | Yes | **OpenClo has** — parametric relationships |
| Real-time parametric sliders | No | Yes | **OpenClo has** — adjust dimensions via sliders |

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
| Manual marker placement | Yes | No | Gerber: Easy Marking interactive tool |
| Automatic nesting | Yes | Partial (#195) | Gerber + AccuNest — industrial-grade |
| AccuNest optimization | Yes | No | **Gerber has** — AI-powered nesting with 2-5% material savings |
| Cloud nesting | Yes | No | **Gerber has** — cloud-based nesting service |
| Sectional markers | Yes | No | **Gerber has** — split markers into sections for staging |
| Shade zone nesting | Yes | No | **Gerber has** — nesting with fabric shade variation zones |
| Bundle markers | Yes | No | **Gerber has** — group pieces by bundle for cutting |
| Fabric utilization reports | Yes | No | **Gerber has** — waste % and cost reports |
| Marker constraints | Yes | No | **Gerber has** — tilt limits, gap, buffer, grain direction |
| Multi-fabric markers | Yes | No | **Gerber has** — different fabrics in same marker |
| Stripe/plaid matching | Yes | No | **Gerber has** — match patterns across pieces |
| Roll width/length configuration | Yes | No | **Gerber has** |
| Costing markers vs production markers | Yes | No | **Gerber has** — fast costing vs optimized production |
| Marker plotting | Yes | No | **Gerber has** — direct output to plotters |

### 4. 3D Simulation

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| Cloth physics simulation | Via VStitcher | Yes (XPBD) | OpenClo: native Rust WASM solver |
| Self-collision | Via VStitcher | Yes | |
| Real-time simulation | Via VStitcher | Yes | **OpenClo better** — native, not third-party |
| Fabric presets library | 42 presets | 32+ presets | Gerber: Lectra-tested fabrics |
| Collision bodies (multi-mesh) | No | Yes | **OpenClo has** — import any mesh as collision body |
| Simulation snapshots (A/B/C) | No | Yes | **OpenClo has** — compare drape states |
| Air drag / damping | No | Yes | **OpenClo has** — anisotropic air resistance |
| WASM + JS fallback | No | Yes | **OpenClo has** — works on any browser |
| Avatar customization | Yes | Yes | Both support parametric + imported avatars |
| Mark-up/drawing on 3D | Yes | No | **Gerber has** — draw on 3D simulation for adjustments |

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
| Cut order planning | Yes | No | **Gerber has** — optimize cut orders per production run |
| Spread planning | Yes | No | **Gerber has** — plan fabric lay-up sequences |
| Material utilization tracking | Yes | No | **Gerber has** — track consumption vs estimates |
| Production scheduling | Yes | No | **Gerber has** — timeline and resource planning |
| Order management | Yes | No | **Gerber has** — manage customer/production orders |
| Cost estimation | Yes | No | **Gerber has** — per-order cost calculation |
| Integration with ERP | Yes | No | **Gerber has** — connect to factory ERP systems |

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

### 12. File Formats

| Feature | Gerber AccuMark | OpenClo | Notes |
|---------|:-:|:-:|-------|
| DXF (AAMA/ASTM) | Yes | Yes | |
| Gerber native (.zip storage) | Yes | No | Gerber proprietary format |
| PDF/AI export | Yes | Yes | |
| RUL (grade rules) | Yes | No | Gerber: import/export grade rules |
| OBJ/FBX 3D export | Via VStitcher | Yes | |
| CSV measurements | Yes | Partial | |
| Lectra/Optitex interop | Yes | No | **Gerber has** — cross-platform pattern exchange |

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

### Recommended Integrations (rather than rebuilding)

Instead of rebuilding Gerber's production features, OpenClo should focus on **interoperability**:

1. **DXF/AAMA export** → Already done. Gerber can import OpenClo patterns.
2. **RUL grade rule export** → Add to #227. Let Gerber users import OpenClo grading.
3. **Marker-ready output** → Export patterns with fabric codes and grain direction that Gerber's AccuNest can consume.
4. **MTM API integration** → OpenClo designs + Gerber MTM automation = end-to-end custom tailoring.
