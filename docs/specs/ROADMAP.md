# OpenClo.ai — Product Roadmap (v0.7)

## Vision

To build the world's first **Cognitive Design Engine** for fashion. We aim to democratize professional garment engineering by combining a semantic CAD engine with situated AI agency and industrial-grade physics.

---

## v0.1-v0.5: Foundations & Physics Engine (DONE)

The "Core Simulation Pipeline Gap" has been closed. OpenClo.ai now features a professional, deterministic pipeline from pattern drafting to 3D drape.

### Core Simulation Pipeline
- [x] **CDT Meshing** — `cdt2d` integration for simulation-ready triangle meshes.
- [x] **Seam Assembly System** — Arc-length parameterization for virtual sewing.
- [x] **Semantic Garment Placement** — Automatic positioning of pieces around the avatar.
- [x] **Avatar Collision** — Optimized SDF-based collision in Web Workers.
- [x] **Self-Collision** — Spatial hashing for multi-layer cloth-on-cloth interaction.
- [x] **Deterministic XPBD Solver** — High-performance Rust/Wasm solver in Web Worker.

### Cognitive Agent Architecture
- [x] **Situated AI Copilot** — Agentic loop with 42 tools and proactive analysis.
- [x] **Durable Design Memory** — Cross-session persistence for technical decisions.
- [x] **Adaptive Skill System** — Formula overrides based on observed user behavior.
- [x] **Ollama Support** — 100% private, local-first AI execution.

---

## v0.6: Marketplace & Professional Ingestion (DONE)

### Skill Marketplace
- [x] **Skill Marketplace SDK** — Namespacing, guardrails, community plugin architecture.
- [x] **SkillBuilder API** — Authoring tool for creating and calibrating new skills.
- [x] **Skill Registry** — NSID system with namespace management.

### Professional Ingestion
- [x] **Seamly2D Hydration** — Intelligent import of legacy parametric patterns.
- [x] **Universal Collision Bodies** — Any imported mesh as collision object with friction/offset.

---

## v0.7: Precision & Professional Tools (CURRENT)

### Professional Editing Tools
- [x] **Linked Editing** — Symmetric pattern propagation (instance + mirror modes).
- [x] **Segment Sewing** — Multi-seam type tool (standard, french, flat-felled, overlock).
- [x] **Topstitch Tools** — 4 modes: edit, free, seamline, segment with overlay UI.
- [x] **Split/Merge Tools** — Scissors and merge for pattern piece operations.
- [x] **Measure Tool** — Multi-unit measurement with copilot integration.

### 3D & Simulation
- [x] **3D Navigation Presets** — 8 camera views with focus-on-piece zoom.
- [x] **Simulation Snapshots** — A/B/C comparison for draping states.
- [x] **32+ Fabric Presets** — Expanded physical fabric library.

### Architecture
- [x] **Geometry Reference Stability** — Deterministic `pieceId:name` edge IDs.
- [x] **Agentic Copilot Loop** — Unified AgenticLoop replacing Planner/Executor/Reasoner.
- [x] **Display Bar 2D** — Quick toggles for 2D viewport display options.
- [x] **DXF High-Fidelity Import** — Full entity support with AAMA layer mapping.

### In Progress
- [ ] **BVH Collision** — Accelerated collision detection (design complete).
- [ ] **Live Link 2D-3D** — Warm-start re-simulation on 2D edits.
- [ ] **2D Editor Performance** — Ongoing optimization.

---

## v0.8: Collaboration & Enterprise (NEXT)

### Team Workflows
- [ ] **Multi-User Sync** — Real-time collaborative drafting (Figma-style).
- [ ] **Plugin Marketplace Backend** — Hosted registry for community skill discovery.
- [ ] **Skill Versioning** — Dependency management and version resolution.
- [ ] **Namespace Verification** — Identity verification for professional contributors.

### Production Tools
- [ ] **Nesting Layout Tool** — Marker creation and fabric optimization.
- [ ] **Trim Tools** — Zippers, buttons, snaps integrated into patterns.
- [ ] **Advanced Fabric Lab** — Calibration tool for real-world fabric data import.
- [ ] **Avatar Morphing** — Full parametric avatar with auto-grading integration.

---

## v1.0: Industrial Maturity (Planned)

### Structural Integrity
- [ ] **Production Security Revision** — Comprehensive security audit.
- [ ] **Constraint Solver** — Full geometric constraint engine for the semantic graph.
- [ ] **Non-Linear Materials** — High-fidelity simulation for leather and hardware.

### Collaborative Engineering
- [ ] **Real-Time Co-Design** — Multi-user editing with agentic conflict resolution.
- [ ] **WebGPU Simulation** — Compute-shader physics for 100x vertex density.

### Deployment & Reach
- [ ] **Professional Landing Page** — High-impact cognitive design narrative.
- [ ] **Mobile Pro** — Voice-first PWA with haptic feedback and offline support.
- [ ] **CLO3D (.zprj) Support** — Professional migration service.

---

## Long-term Vision
- **3D Pen Tool / Mesh Grab**: Direct 3D manipulation of draped fabric.
- **Generative Pattern Synthesis**: Natural language to tech-pack generation.
- **Garment-to-Garment Collision**: Multi-layer clothing support.
- **Kinematic Comfort Evaluation**: Fit maps during avatar movement.
- **Volume Simulation**: Internal pressure and tension mapping.
- **3D Decal Projection**: Graphics on 3D garment with auto-unwrap.
- **Diagnostic Inspector**: Click any point, get exact data + explanation + fix.
- **AR/VR Fitting**: Virtual try-on integration for e-commerce.
