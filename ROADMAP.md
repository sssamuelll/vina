# OpenClo Roadmap — Path to v1.0

**OpenClo** is currently in **Phase 3: Precision & Professional Tools (v0.7.x)**.
Our goal is to reach **v1.0.0 (Production Ready)** by Q2 2026.

---

## [Completed] v0.5.x — Physics Engine & Agent Foundation (February 2026)

- [x] **XPBD Cloth Simulation**: Rust/WASM deterministic solver at 60fps.
- [x] **10 Calibrated Fabrics**: Physical profiles with real-world shear/stretch data.
- [x] **AI Agent (5 phases)**: 42+ tools, skills, durable memory, plugin system.
- [x] **Professional Engines**: Seam allowance, nesting, grading, formula, DXF/PDF/OBJ export.

## [Completed] v0.6.x — Architectural Shift (February-March 2026)

- [x] **Rust WASM Solver**: Sub-millisecond physics updates in Web Worker.
- [x] **Universal Collision Bodies**: Any imported mesh as collision object with per-body friction, offset, transform gizmo, and GLB/FBX animation playback.
- [x] **Cognitive Engine**: Transition from chatbot to Situated AI Agent with design memory.
- [x] **Silent Ingestion Layer**: Automated hydration of Seamly2D/DXF files into Semantic Graph.
- [x] **Skill Marketplace SDK**: Namespacing, guardrails, SkillBuilder API.
- [x] **32+ Fabric Presets**: Expanded physical fabric library.

## [Current] v0.7.x — Precision & Professional Tools (March 2026)

- [x] **Linked Editing**: Symmetric pattern propagation (instance + mirror modes) with middleware.
- [x] **Segment Sewing**: Multi-seam type tool (standard, french, flat-felled, overlock).
- [x] **Topstitch Tools**: 4 modes (edit, free, seamline, segment) with overlay UI.
- [x] **3D Navigation**: 8 camera presets with focus-on-piece zoom.
- [x] **Display Bar 2D**: Quick toggles for seam allowance, piece names, line lengths, render modes.
- [x] **Split/Merge Tools**: Scissors (split) and merge tools for pattern piece operations.
- [x] **Measure Tool**: Click-to-measure with unit selection and copilot integration.
- [x] **Simulation Snapshots**: A/B/C comparison slots for draping states.
- [x] **DXF High-Fidelity**: Full parser/converter/export with AAMA layer support, notch geometry, splines.
- [x] **Geometry Reference Stability**: Deterministic edge IDs (`pieceId:name`), edge-name seam references.
- [x] **Agentic Copilot Loop**: Unified AgenticLoop replacing old Planner/Executor/Reasoner pattern.
- [x] **Skill Authoring**: SkillBuilder class with preview, validation, and export.
- [ ] **BVH Collision**: Accelerated collision detection (dependency added, design complete).
- [ ] **Live Link 2D-3D**: Warm-start re-simulation on 2D edits (edit classifier done).
- [ ] **2D Editor Performance**: Ongoing optimization for high-frequency interactions.

## [Next] v0.8.x — Collaboration & Enterprise (April 2026)

- [ ] **Multi-User Sync**: Real-time collaborative drafting (Figma-style).
- [ ] **Advanced Fabric Lab**: Calibration tool for real-world fabric physical data.
- [ ] **Avatar Morphing**: Full parametric avatar with auto-grading integration.
- [ ] **Plugin Marketplace Beta**: Community-contributed skills with backend registry.
- [ ] **Nesting Layout Tool**: Marker creation and fabric optimization.
- [ ] **Trim Tools**: Zippers, buttons, snaps integrated into patterns.

## [The Milestone] v1.0.0 — Production Ready (Q2 2026)

- [ ] **Security Revision**: Comprehensive production security audit (#205).
- [ ] **Full Interop**: Bidirectional support for CLO3D (.zprj) and Gerber (.tmp).
- [ ] **Plugin Sandboxing**: Secure Web Worker isolation for community skills.
- [ ] **OpenClo Cloud**: Global design repository for sharing open-source pattern assets.
- [ ] **Landing Page**: Technical showcase at openclo.ai (#187).

---

## Long-term Vision
- **3D Pen Tool / Mesh Grab**: Direct 3D manipulation of draped fabric.
- **Generative Pattern Synthesis**: Natural language to tech-pack generation.
- **Garment-to-Garment Collision**: Multi-layer clothing support.
- **Volume Simulation**: Internal pressure and tension mapping.
- **AR/VR Fitting**: Virtual try-on integration for e-commerce.
- **Eco-Optimizer**: Real-time nesting to minimize fabric waste for sustainable production.
