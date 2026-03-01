# OpenClo.ai — Product Roadmap

## Vision

To build the world's first **Cognitive Design Engine** for fashion. We aim to democratize professional garment engineering by combining a semantic CAD engine with situated AI agency and industrial-grade physics.

---

## ✅ v0.1–v0.5: Foundations & Physics Engine (DONE)

The "Core Simulation Pipeline Gap" has been closed. OpenClo.ai now features a professional, deterministic pipeline from pattern drafting to 3D drape.

### Core Simulation Pipeline
- [x] **CDT Meshing** — `cdt2d` integration for simulation-ready triangle meshes.
- [x] **Seam Assembly System** — Arc-length parameterization for virtual sewing.
- [x] **Semantic Garment Placement** — Automatic positioning of pieces around the avatar using PieceCategory and Side metadata.
- [x] **Avatar Collision** — Optimized SDF-based collision in Web Workers (M2/Safari compatible).
- [x] **Self-Collision** — Spatial hashing for multi-layer cloth-on-cloth interaction.
- [x] **Deterministic XPBD Solver** — High-performance Rust/Wasm solver in Web Worker.

### Cognitive Agent Architecture
- [x] **Situated AI Copilot** — Agentic loop with 42 tools and proactive analysis.
- [x] **Durable Design Memory** — Cross-session persistence for technical decisions and preferences.
- [x] **Adaptive Skill System** — Formula overrides based on observed user behavior.
- [x] **Ollama Support** — 100% private, local-first AI execution.

---

## 🔨 v0.6: Marketplace & Professional Ingestion (NEXT)

**Goal:** Shift from "Engine Building" to "Ecosystem Growth."

### Skill Marketplace
- [ ] **Decentralized Hub** — Shared repository for professional tailoring skills.
- [ ] **Skill Authoring Tool** — Visual environment for creating and calibrating new Skills.
- [ ] **Versioning & Registry** — Proper namespace management for community contributions.

### Professional Ingestion (Silent Layer)
- [ ] **Seamly2D Hydration** — Intelligent import of legacy parametric patterns.
- [ ] **CLO3D (.zprj) Support** — Professional migration service for ZPRJ files.
- [ ] **DXF-ASTM Rule Tables** — Support for industrial grading rule files (.rul).

### High-Fidelity Interaction
- [ ] **3D Direct Manipulation** — Grab and pull the draped garment in the 3D viewport.
- [ ] **Dynamic Pinning** — AI-assisted placement of temporary pins during fitting.

---

## 📋 v1.0: Industrial Maturity (Planned)

### Structural Integrity
- [ ] **Constraint Solver** — Full geometric constraint engine for the semantic graph.
- [ ] **Non-Linear Materials** — High-fidelity simulation for leather and hardware.

### Collaborative Engineering
- [ ] **Real-Time Co-Design** — Multi-user editing with agentic conflict resolution.
- [ ] **WebGPU Simulation** — Compute-shader physics for 100x vertex density.

### Deployment & Reach
- [ ] **Professional Landing Page (`openclo.ai`)** — High-impact cognitive design narrative.
- [ ] **Mobile Pro** — Voice-first PWA with haptic feedback and offline support.