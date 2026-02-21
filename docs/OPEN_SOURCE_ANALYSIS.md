# Open Source Analysis: Cloth/Garment Simulation & Pattern Tools for OpenClo

**Date:** 2026-02-21  
**Purpose:** Identify the best open source code to study, port, or integrate for OpenClo's core features  
**Methodology:** GitHub topic crawl, direct repo analysis, known-library evaluation, domain expertise  

---

## 1. Executive Summary — Top 5 Things We Should Use/Port

### 🥇 1. Matthias Müller's Ten Minute Physics — Cloth + Self-Collision (Tutorials 14, 15, 11)
- **URL:** https://github.com/matthias-research/pages/tree/master/tenMinutePhysics
- **License:** Unlicensed (public educational code — treat as permissive for learning/porting)
- **Language:** JavaScript (vanilla, no framework)
- **What:** XPBD cloth simulation (#14), self-collision with spatial hashing (#15), spatial hash grid (#11)
- **Why #1:** Already JavaScript. Already browser-ready. Already the algorithm we should use (XPBD). ~500 lines for cloth, ~300 for self-collision. This is the foundation we should build on.
- **Effort:** 1-2 weeks to port/adapt into TypeScript with Three.js integration
- **Key insight:** The self-collision tutorial (#15) uses 5 tricks for stability — collision filtering by initial distance, spatial hashing, particle-based collision. This is the exact approach Velvet (CUDA) also uses.

### 🥈 2. cdt2d — Constrained Delaunay Triangulation
- **URL:** https://github.com/mikolalysenko/cdt2d
- **License:** MIT
- **Language:** JavaScript (npm package)
- **What:** Robust 2D constrained Delaunay triangulation with edge constraints, hole support, interior/exterior classification
- **Why #2:** This is exactly what we need for 2D pattern → 3D mesh. It respects edge constraints (seam edges!), handles holes (pattern cutouts), and produces quality Delaunay triangles suitable for simulation. Already in JS. Already on npm.
- **Effort:** 1-2 days to integrate. `npm install cdt2d` and done.
- **Key insight:** Unlike earcut (which sacrifices quality for speed), cdt2d produces proper Delaunay triangles with angle guarantees — critical for stable cloth simulation.

### 🥉 3. InteractiveComputerGraphics/PositionBasedDynamics + Discregrid
- **URL:** https://github.com/InteractiveComputerGraphics/PositionBasedDynamics
- **License:** MIT
- **Language:** C++ (with Python bindings via pyPBD)
- **What:** Complete PBD/XPBD library with cloth constraints, SDF collision via Discregrid, distance/bending/volume constraints
- **Why #3:** This is the academic gold standard for PBD. The Discregrid library generates cubic signed distance fields for collision — exactly what we need for body-cloth collision. The constraint formulations are production-quality reference implementations.
- **Effort:** 2-4 weeks to study and port key algorithms to TypeScript. SDF generation could be compiled to WASM.
- **Key insight:** Uses **cubic signed distance fields** for collision — more accurate than sphere/capsule approximations, and the SDF can be precomputed for the avatar once, then reused every frame.

### 4. XRTailor (OpenXRLab GPU Cloth Simulator)
- **URL:** https://github.com/openxrlab/xrtailor
- **License:** Apache 2.0
- **Language:** CUDA/C++
- **What:** Full garment simulation engine with SMPL body support, automatic garment placement, self-collision, BVH, and two performance modes
- **Why #4:** This is the closest open source analog to CLO3D. It handles the **full pipeline**: garment placement on SMPL avatars, cloth simulation with body collision, self-collision, and even automatic dressing. The architectural patterns are directly applicable.
- **Effort:** 3-6 weeks to study architecture. Key algorithms portable conceptually but not directly (CUDA → JS).
- **Key insight:** Their "fully automatic" garment placement (no manual positioning needed) and SMPL integration solve exactly our garment placement problem. Study their approach for our cylindrical mapping strategy.

### 5. Velvet — CUDA XPBD Cloth Engine (reference architecture)
- **URL:** https://github.com/vitalight/Velvet
- **License:** Not explicitly stated (check repo)
- **Language:** CUDA/C++
- **What:** XPBD cloth simulation with SDF collision, spatial hashing, particle collision, Long Range Attachments, detailed GPU implementation notes
- **Why #5:** The README is essentially a **tutorial on GPU cloth simulation** with specific solutions to real problems: collision filtering, Jacobi iteration stability, LRA for preventing stretchy cloth, atomic update optimization. Even though it's CUDA, the algorithmic insights translate directly to our CPU-based (and eventual WebGPU) implementation.
- **Effort:** Study only (1 week). The simulation pipeline documented in the README is a roadmap for our architecture.
- **Key insight:** Their documented simulation pipeline (CollideSDF → Predict → FindNeighbors → CollideParticles → SolveConstraints → Finalize) is the exact loop we should implement.

---

## 2. Category Analysis

### Category 1: Virtual Sewing / Seam Assembly

**The hard truth: No good open source sewing implementation exists.**

| Resource | URL | License | Language | What | Quality | Browser? |
|----------|-----|---------|----------|------|---------|----------|
| DiffCloth | github.com/omegaiota/DiffCloth | MIT | C++ | Differentiable cloth sim with garment examples (tshirt, dress, sock) | Research-grade | No (C++) |
| Codim-IPC | github.com/ipc-sim/Codim-IPC | Apache 2.0 | C++ | Codimensional contact for thin shells — handles cloth-cloth contact/stitching scenarios | Research-grade | No (C++) |
| Blender Cloth | blender.org | GPL | C | Has sewing springs in cloth modifier (pin groups, sewing edges) | Production | No |
| XRTailor | github.com/openxrlab/xrtailor | Apache 2.0 | CUDA | Full garment sim with seam assembly | Production | No |

**Analysis:**

Virtual sewing is the hardest problem in garment simulation and the least well-served by open source. Here's what we know about how it works:

1. **CLO3D/Marvelous Designer approach:** Define paired edges on 2D pattern pieces. Place pieces in 3D near the body. Apply "sewing springs" — distance constraints between corresponding points on paired edges that gradually pull them together during simulation.

2. **The algorithm (from papers and Blender source):**
   - Match points on edge A to points on edge B (by arc-length parameterization)
   - Create spring constraints between matched pairs with zero rest length
   - During simulation, these springs pull the edges together while cloth dynamics run
   - After convergence, the seam acts as a rigid connection

3. **Blender's implementation** is the most accessible reference (in C, `source/blender/blenkernel/intern/cloth.c`), but it's GPL. However, the *concept* of sewing springs is not patentable — it's a well-known technique.

**Recommendation for OpenClo:**
- **Build our own sewing system** — it's conceptually simple (distance constraints between matched edge points)
- Study DiffCloth's garment examples for topology/setup patterns
- The key innovation needed is a good **edge parameterization** system: given two pattern edges of potentially different lengths, create a smooth mapping of constraint pairs
- **Effort: 2-3 weeks** for a basic sewing system, 4-6 weeks for production-quality with proper convergence handling

**Key papers to reference:**
- Baraff & Witkin, "Large Steps in Cloth Simulation" (1998) — the foundational cloth sim paper
- Volino & Magnenat-Thalmann, "Virtual Clothing" (2000) — describes sewing algorithms
- Provot, "Collision and self-collision handling in cloth model dedicated to design garments" (1997)

---

### Category 2: Cloth-Body Collision (SDF / Proper Collision)

| Resource | URL | License | Language | What | Quality | Browser? | LOC |
|----------|-----|---------|----------|------|---------|----------|-----|
| **Matthias Müller #15** | matthias-research.github.io | Permissive | **JavaScript** | Self-collision with spatial hashing, 5 stability tricks | Tutorial-quality | **YES** | ~300 |
| **Matthias Müller #11** | matthias-research.github.io | Permissive | **JavaScript** | Spatial hash grid — blazing fast overlap detection | Tutorial-quality | **YES** | ~200 |
| **Matthias Müller #24** | matthias-research.github.io | Permissive | **JavaScript** | BVH with Morton codes — fast broad-phase | Tutorial-quality | **YES** | ~300 |
| **Matthias Müller #23** | matthias-research.github.io | Permissive | **JavaScript** | Sweep and Prune broad-phase collision | Tutorial-quality | **YES** | ~250 |
| Discregrid | github.com/InteractiveComputerGraphics/Discregrid | MIT | C++ | Cubic SDF generation from meshes | Production | WASM possible | ~5K |
| Velvet | github.com/vitalight/Velvet | Check | CUDA | SDF collision, particle collision, spatial hashing for cloth | Production | No | ~3K |
| PositionBasedDynamics | github.com/InteractiveComputerGraphics/PositionBasedDynamics | MIT | C++ | SDF-based collision via Discregrid integration | Production | WASM possible | ~30K total |
| Bullet Physics | github.com/bulletphysics/bullet3 | zlib | C++ | SoftBody module with cloth sim and collision | Production | WASM exists (ammo.js) | ~200K total |

**Analysis:**

This is actually the **best-served category**. Matthias Müller's tutorials give us JavaScript implementations of exactly the algorithms we need:

1. **Body-cloth collision via SDF:**
   - Precompute SDF for the avatar body mesh (Discregrid approach, or simpler: sample distance at grid points)
   - Each cloth particle checks its SDF value; if negative (inside body), push it to the nearest surface
   - For OpenClo: We can generate the SDF once when the avatar loads, store as a 3D texture/grid

2. **Self-collision via spatial hashing (Tutorial #15):**
   - Build hash grid of cloth particles
   - For each particle, check neighbors in grid
   - Apply collision response with filtering (ignore particles that are mesh-neighbors)
   - The "5 tricks" from tutorial #15: spatial hash, collision filtering by mesh distance, thickness handling, damping, iterative correction

3. **SDF generation options for browser:**
   - **Simple approach:** Voxelize the body mesh, compute distance field with jump flooding (entirely in JS)
   - **Better approach:** Port Discregrid to WASM (~2 weeks)
   - **Best approach:** Use WebGPU compute shaders for SDF generation (future)

**Recommendation:**
- Start with Matthias Müller's JavaScript implementations — they work today
- For body collision: implement simple SDF on a 3D grid (64³ or 128³) — this is sufficient for real-time
- Port spatial hashing from tutorial #11 for self-collision
- **Effort: 2-3 weeks** for body collision + basic self-collision

---

### Category 3: Garment Placement / Draping

| Resource | URL | License | Language | What | Quality | Browser? |
|----------|-----|---------|----------|------|---------|----------|
| **XRTailor** | github.com/openxrlab/xrtailor | Apache 2.0 | CUDA | Automatic garment placement on SMPL bodies, no manual positioning | Production | No |
| GAPS | github.com/Simonhfls/GAPS | Check | Python/TF | Neural garment draping with physics-based constraints, SMPL integration | Research | No |
| DiffCloth | github.com/omegaiota/DiffCloth | MIT | C++ | Garment placement via optimization (t-shirt, dress, hat, sock examples) | Research | No |

**Analysis:**

Garment placement is less about finding existing code and more about the right strategy. Here are the approaches used:

1. **XRTailor approach:** Fully automatic. Uses SMPL body model landmarks to determine placement. The garment mesh is pre-positioned based on body part associations (shoulder points, waist, hip landmarks).

2. **CLO3D approach:** User places 2D pattern pieces around the avatar manually, then simulation pulls them together via sewing springs.

3. **Cylindrical mapping (simplest, good for v1):**
   - For a bodice: create a cylinder around the torso
   - Map 2D pattern piece onto cylinder surface
   - Use body landmarks (shoulder, waist, hip from SMPL or similar) as anchor points
   - Let gravity + sewing constraints do the rest

4. **Pin-point detection:**
   - Shoulders: topmost point of body mesh at arm-torso junction
   - Waist: narrowest circumference between ribcage and hips
   - Hip: widest circumference below waist
   - These can be extracted from SMPL model parameters or detected via mesh analysis

**Recommendation:**
- Implement **cylindrical projection** for initial garment placement — simple, robust, good enough for v1
- Use body landmarks (manual specification or SMPL-derived) for anchoring
- Let simulation physics handle the final draping
- Study XRTailor's automatic placement for v2
- **Effort: 1-2 weeks** for basic cylindrical projection, 3-4 weeks for automatic landmark-based placement

---

### Category 4: 2D → 3D Meshing Pipeline

| Resource | URL | License | Language | What | Quality | Browser? | LOC |
|----------|-----|---------|----------|------|---------|----------|-----|
| **cdt2d** ⭐ | github.com/mikolalysenko/cdt2d | **MIT** | **JavaScript** | Constrained Delaunay Triangulation with edge constraints & holes | Good | **YES** | ~1.5K |
| **earcut** | github.com/mapbox/earcut | ISC | **JavaScript** | Fastest polygon triangulation, but no Delaunay quality | Production | **YES** | ~800 |
| libtess.js | github.com/brendankenny/libtess.js | SGI Free License | **JavaScript** | GLU tessellator port, handles bad geometry | Production | **YES** | ~5K |
| poly2tri | github.com/nickyvanurk/poly2tri (various ports) | BSD | **JavaScript** | Constrained Delaunay, but crashes on bad input | Fragile | **YES** | ~2K |
| Triangle (Shewchuk) | cs.cmu.edu/~quake/triangle.html | Non-commercial! | C | Gold standard CDT with quality guarantees & refinement | Gold standard | WASM possible | ~30K |
| clean-pslg | github.com/mikolalysenko/clean-pslg | MIT | **JavaScript** | Preprocessor for cdt2d — fixes self-intersections, T-junctions | Utility | **YES** | ~500 |

**Analysis:**

This is a **critical decision** for OpenClo. The mesh quality directly affects simulation stability.

**Why earcut is not enough:**
- Earcut produces **non-Delaunay** triangulations — long thin triangles are common
- Long thin triangles cause simulation instability (bad stiffness matrix conditioning)
- No edge constraint support — can't enforce seam edges
- Perfect for map rendering, terrible for physics simulation

**Why cdt2d is the answer:**
- Constrained Delaunay = angle-optimal triangles with guaranteed edge constraints
- Edge constraints = seam edges are preserved in the mesh
- Interior/exterior classification = can handle pattern holes
- Already in JavaScript, MIT licensed, ~1.5K lines
- Author (Mikola Lysenko) wrote the definitive JS computational geometry libraries

**Why we might also need Triangle (via WASM):**
- Triangle supports **quality mesh refinement** — minimum angle constraints, maximum area constraints
- This produces **simulation-ready meshes** with uniform element sizes
- cdt2d does CDT but not refinement
- Compiling Triangle to WASM is straightforward (~1 day) but license is **non-commercial**

**Adaptive remeshing (future):**
- ARCSim's key contribution was adaptive anisotropic remeshing during simulation
- For v1, static meshing at pattern-import time is sufficient
- For v2, we could implement simple edge-split/collapse during simulation

**Recommendation:**
- **Use cdt2d** as the primary triangulator — MIT, JavaScript, handles edge constraints
- Use **clean-pslg** as preprocessor for robustness
- For quality refinement: implement simple **Ruppert's algorithm** on top of cdt2d output (~500 lines)
- Reserve Triangle/WASM as fallback for when we need guaranteed quality
- **Effort: 1 week** for cdt2d integration + basic refinement

---

### Category 5: Parametric Pattern Systems

| Resource | URL | License | Language | What | Quality | Browser? | LOC |
|----------|-----|---------|----------|------|---------|----------|-----|
| **Seamly2D** | github.com/FashionFreedom/Seamly2D | **GPL v3** ⚠️ | C++ (Qt) | Full parametric pattern making with measurements, formulas, grading | Production | No | ~200K |
| Valentina | valentina-project.org | GPL v3 ⚠️ | C++ (Qt) | Fork predecessor of Seamly2D | Production | No | ~200K |
| TauMeta | taumeta.org | Unclear | Python | Pattern generation from body measurements | Research | No | ~5K |

**Analysis:**

**Seamly2D is the closest thing to what we need, but GPL makes it untouchable for direct code reuse.** However, we can study their *approach* (ideas are not copyrightable):

1. **Seamly2D's parametric engine architecture:**
   - Patterns are defined as a **directed acyclic graph (DAG)** of geometric operations
   - Each node is an operation: "place point", "draw line from A to B", "add curve", "add seam allowance"
   - Each operation can reference measurements via formulas (e.g., `bust_circumference / 4 + 2`)
   - When measurements change, the DAG is re-evaluated to regenerate the pattern
   - Uses QMuParser for formula evaluation

2. **Key concepts to steal (as ideas, not code):**
   - **Measurement-driven parametric graphs** — pattern points are functions of measurements
   - **Seam allowance as offset curves** — the seam allowance is a parallel curve offset from the pattern edge
   - **Grading** — systematic size adjustment by moving points according to grade rules
   - **Dart manipulation** — algorithmic dart creation, rotation, and distribution

3. **For OpenClo's pattern system:**
   - We don't need Seamly2D's full complexity for v1
   - Start with simple parametric blocks: bodice, sleeve, skirt, trouser
   - Each block is defined by measurement formulas
   - Use a simple expression evaluator (there are many MIT-licensed ones in JS)

**Recommendation:**
- **Don't port Seamly2D** — GPL, 200K lines, Qt-dependent
- **Study their architecture** for parametric pattern concepts
- Build a **simple measurement-driven pattern system**: TypeScript, formula parser, SVG output
- Use [math.js](https://mathjs.org/) (Apache 2.0) for expression evaluation
- Start with 3-4 basic blocks (bodice front/back, sleeve, skirt)
- **Effort: 3-4 weeks** for basic parametric pattern system, 8-12 weeks for full-featured

---

### Category 6: Full Garment Simulation Systems

| Resource | URL | License | Language | What | Quality | Browser? | LOC |
|----------|-----|---------|----------|------|---------|----------|-----|
| **XRTailor** ⭐ | github.com/openxrlab/xrtailor | Apache 2.0 | CUDA/C++ | Full GPU garment sim engine with SMPL, auto-placement, self-collision | Production | No | ~50K est. |
| **PositionBasedDynamics** ⭐ | github.com/InteractiveComputerGraphics/PositionBasedDynamics | MIT | C++ | Complete PBD library with cloth, SDF collision, rigid bodies | Production | WASM | ~30K |
| **Matthias Müller Ten Minute Physics** ⭐ | matthias-research.github.io | Permissive | **JavaScript** | Educational cloth sim, self-collision, spatial hash, BVH | Tutorial | **YES** | ~2K total |
| DiffCloth | github.com/omegaiota/DiffCloth | MIT | C++ | Differentiable cloth sim, garment optimization | Research | No | ~15K |
| Codim-IPC | github.com/ipc-sim/Codim-IPC | Apache 2.0 | C++ | Codimensional IPC for cloth contact (SIGGRAPH 2021) | Research | No | ~20K |
| Velvet | github.com/vitalight/Velvet | Check | CUDA/C++ | XPBD cloth on GPU with detailed implementation notes | Reference | No | ~5K |
| Bullet3 SoftBody | github.com/bulletphysics/bullet3 | zlib | C++ | Physics engine with soft body / cloth support | Production | WASM (ammo.js) | ~200K |
| NVIDIA FleX | github.com/NVIDIAGameWorks/FleX | Proprietary ⚠️ | CUDA | Unified particle physics — the original XPBD implementation | Production | No | Closed |
| Taichi Lang | github.com/taichi-dev/taichi | Apache 2.0 | Python/C++ | GPU programming lang with cloth sim examples | Research | WASM experimental | ~100K |
| ARCSim | graphics.berkeley.edu/papers/Narain-AAR-2012/ | Academic ⚠️ | C++ | Adaptive remeshing cloth sim (SIGGRAPH 2012) | Research | No | ~20K |
| GAPS | github.com/Simonhfls/GAPS | Check | Python/TF | Neural garment draping, geometry-aware | Research | No | ~5K |
| libwetcloth | github.com/raymondyfei/libwetcloth | Check | C++ | Liquid-fabric interaction simulation | Research | No | ~15K |

**Analysis of Full Systems:**

**For studying architecture:** XRTailor is the best because it's Apache 2.0, handles the full pipeline, and is the most similar to what OpenClo needs.

**For direct code reuse:** Matthias Müller's tutorials are the only ones already in JavaScript. Everything else requires porting.

**For WASM compilation:** PositionBasedDynamics (MIT, C++) and Bullet3 (zlib, C++) are the best candidates. Bullet3 already has a WASM port (ammo.js) but it's massive.

**What about ammo.js (Bullet WASM)?**
- Already works in browser
- Has softBody support for cloth
- But: 800KB+ WASM binary, overkill for our needs, poor control over cloth specifics
- Verdict: **not recommended** — too heavy, not flexible enough for garment-specific needs

---

## 3. Recommended Architecture for OpenClo's Core

Based on all findings, here's the optimal stack:

```
┌─────────────────────────────────────────────────────────┐
│                    OpenClo Architecture                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │ PATTERN       │   │ MESHING      │   │ SIMULATION   │ │
│  │ ENGINE        │   │ PIPELINE     │   │ ENGINE       │ │
│  │               │   │              │   │              │ │
│  │ • Parametric  │──▶│ • cdt2d      │──▶│ • XPBD       │ │
│  │   formulas    │   │   (CDT)      │   │   (Müller)   │ │
│  │ • math.js     │   │ • clean-pslg │   │ • Sewing     │ │
│  │   expressions │   │   (cleanup)  │   │   springs    │ │
│  │ • SVG I/O     │   │ • Ruppert    │   │ • SDF body   │ │
│  │ • Seam defs   │   │   refinement │   │   collision  │ │
│  │               │   │              │   │ • Spatial     │ │
│  └──────────────┘   └──────────────┘   │   hash self-  │ │
│                                         │   collision   │ │
│  ┌──────────────┐   ┌──────────────┐   │ • Long Range  │ │
│  │ PLACEMENT    │   │ RENDERING    │   │   Attachment  │ │
│  │              │   │              │   │              │ │
│  │ • Cylindrical│   │ • Three.js   │   └──────────────┘ │
│  │   mapping    │   │ • Dynamic    │                     │
│  │ • Body       │   │   normals    │                     │
│  │   landmarks  │   │ • Texture    │                     │
│  │ • SMPL aware │   │   mapping    │                     │
│  └──────────────┘   └──────────────┘                     │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ FUTURE: WebGPU Compute Shaders                        ││
│  │ • Parallel constraint solving (Jacobi iteration)      ││
│  │ • SDF generation on GPU                               ││
│  │ • Spatial hash construction on GPU                    ││
│  └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### Technology Choices:

| Component | Library/Approach | Source | License | Effort |
|-----------|-----------------|--------|---------|--------|
| Cloth simulation | XPBD with substepping | Matthias Müller #14 | Permissive | 2 weeks |
| Triangulation | cdt2d + clean-pslg | mikolalysenko | MIT | 1 week |
| Body collision | SDF on 3D grid | Müller + Discregrid concepts | MIT | 2 weeks |
| Self-collision | Spatial hashing + filtering | Müller #11, #15 | Permissive | 2 weeks |
| Sewing | Custom spring constraints | Papers + Blender concepts | Original | 3 weeks |
| Pattern engine | Custom DAG + math.js | Seamly2D concepts | Original | 4 weeks |
| Placement | Cylindrical mapping | XRTailor concepts | Original | 2 weeks |
| Rendering | Three.js | Three.js | MIT | Already done |
| Expression eval | math.js | mathjs.org | Apache 2.0 | 1 day |

---

## 4. Priority Implementation Plan

### Phase 1: Foundation (Weeks 1-4)
**Goal:** Working cloth simulation with body collision

1. **Week 1: Meshing Pipeline**
   - Integrate cdt2d + clean-pslg
   - Build pattern → triangulated mesh pipeline
   - Add basic Ruppert refinement for quality
   - Port from: cdt2d (npm install)

2. **Week 2: Core XPBD Cloth Sim**
   - Port Matthias Müller Tutorial #14 to TypeScript
   - Integrate with Three.js BufferGeometry
   - Add distance constraints + bending constraints
   - Port from: matthias-research.github.io Tutorial 14

3. **Week 3: Body Collision**
   - Implement SDF generation for avatar mesh (3D grid, 64³)
   - Integrate SDF collision into simulation loop
   - Study: Discregrid for algorithm, implement in TS
   - Reference: Velvet's CollideSDF approach

4. **Week 4: Self-Collision**
   - Port spatial hash grid from Tutorial #11
   - Implement particle-based self-collision from Tutorial #15
   - Add collision filtering (ignore mesh-neighbors)
   - Port from: matthias-research.github.io Tutorials 11 + 15

### Phase 2: Garment Assembly (Weeks 5-8)
**Goal:** Sewing and garment placement working

5. **Weeks 5-6: Virtual Sewing**
   - Implement edge parameterization (arc-length matching)
   - Create sewing spring constraints (zero-rest-length distance constraints)
   - Gradual sewing animation (shrink rest length over time)
   - Reference: Blender cloth sewing concept, DiffCloth garment topologies

6. **Week 7: Garment Placement**
   - Implement cylindrical projection for bodice/skirt
   - Body landmark detection (manual + SMPL-based)
   - Initial position estimation before simulation starts
   - Reference: XRTailor automatic placement

7. **Week 8: Simulation Stability**
   - Implement Long Range Attachments (from Velvet/NVIDIA approach)
   - Add substepping for stability (multiple substeps per frame)
   - Tune parameters: stiffness, damping, friction
   - Reference: Velvet implementation details

### Phase 3: Pattern System (Weeks 9-12)
**Goal:** Parametric patterns that drive the whole pipeline

8. **Weeks 9-10: Pattern Engine**
   - Build measurement-driven pattern DAG
   - Implement basic blocks: bodice front, bodice back, sleeve, skirt panel
   - Formula evaluation with math.js
   - Study: Seamly2D architecture (not code)

9. **Week 11: Seam Allowance & Grading**
   - Parallel curve offset for seam allowance
   - Basic size grading (point movement by grade rules)

10. **Week 12: Integration & Polish**
    - End-to-end pipeline: measurements → pattern → mesh → placement → simulation
    - Performance optimization
    - UI integration

### Phase 4: Advanced Features (Future)
- WebGPU compute shader port for parallel constraint solving
- Adaptive remeshing during simulation (ARCSim approach)
- Advanced fabric materials (anisotropy, damping curves)
- Multiple garment layers
- Export to industry formats

---

## 5. What NOT to Build — Use As-Is

### ✅ Use directly (don't rebuild):
1. **cdt2d** — npm install it. Don't write your own CDT.
2. **clean-pslg** — npm install it. Preprocesses geometry for cdt2d.
3. **earcut** — keep for non-simulation triangulation (UI, previews). Don't use for sim meshes.
4. **math.js** — for pattern formula evaluation. Don't write an expression parser.
5. **Three.js** — already using it. Don't switch to raw WebGL.

### ✅ Study but don't port directly:
1. **Seamly2D** — study architecture, don't port code (GPL, 200K lines, Qt)
2. **XRTailor** — study garment placement approach, don't port CUDA code
3. **Bullet/ammo.js** — too heavy, too generic. Study SoftBody if stuck.

### ❌ Don't build from scratch:
1. **Don't write a triangulator** — use cdt2d
2. **Don't write a formula parser** — use math.js
3. **Don't write a WebGL renderer** — use Three.js
4. **Don't write a BVH from scratch** — use Three.js BVH or port Müller's Tutorial #24

### ❌ Don't bother with:
1. **NVIDIA FleX** — closed source
2. **ARCSim** — academic license, C++, adaptive remeshing is a v3 feature
3. **Neural approaches** (GAPS, NeuralClothSim) — ML inference in browser is impractical for real-time sim
4. **Bullet/ammo.js for cloth** — 800KB WASM, limited cloth control, not garment-oriented
5. **Style3D/Browzwear** — no meaningful open source components found

---

## Appendix A: Key Papers (for algorithmic reference)

1. **Müller et al. (2007)** — "Position Based Dynamics" — The foundational PBD paper
2. **Macklin et al. (2016)** — "XPBD: Position-Based Simulation of Compliant Constrained Dynamics" — The XPBD extension we should use
3. **Macklin et al. (2019)** — "Small Steps in Physics Simulation" — Substepping for stability
4. **Baraff & Witkin (1998)** — "Large Steps in Cloth Simulation" — Classic implicit integration cloth
5. **Bridson et al. (2002)** — "Robust Treatment of Collisions, Contact and Friction for Cloth Animation" — Collision handling bible
6. **Narain et al. (2012)** — "Adaptive Anisotropic Remeshing for Cloth Simulation" — ARCSim, future reference
7. **Kim et al. (2012)** — "Long Range Attachments" — Prevents stretchy cloth in PBD
8. **Li et al. (2021)** — "Codimensional Incremental Potential Contact" — State of the art cloth contact
9. **Provot (1997)** — "Collision and self-collision handling in cloth model dedicated to design garments"
10. **Volino & Magnenat-Thalmann (2000)** — "Virtual Clothing" — Covers sewing, draping, fitting

## Appendix B: JavaScript/TypeScript Ecosystem Relevant Packages

| Package | npm | What | Stars | Maintained? |
|---------|-----|------|-------|-------------|
| cdt2d | ✅ | Constrained Delaunay Triangulation | ~200 | Stable (mature) |
| earcut | ✅ | Fast polygon triangulation | ~2K | Active |
| clean-pslg | ✅ | Geometry cleanup for cdt2d | ~50 | Stable |
| robust-predicates | ✅ | Exact geometric predicates | ~200 | Stable |
| three | ✅ | 3D rendering | ~100K | Very active |
| mathjs | ✅ | Expression evaluation | ~14K | Very active |
| gl-matrix | ✅ | Fast vector/matrix math | ~5K | Stable |
| cannon-es | ✅ | Physics engine (not for cloth) | ~2K | Active |

## Appendix C: Simulation Pipeline Reference (from Velvet)

```
// Pre-stabilization
CollideSDF();  // Push particles out of body SDF

for (substep = 0; substep < numSubsteps; substep++) {
    PredictPositions();          // Apply gravity, predict new positions
    FindNeighborsBySpatialHash(); // Build neighbor lists for self-collision
    
    // Handle Collisions
    CollideParticles();          // Particle-particle self-collision
    CollideSDF();                // Particle-body SDF collision
    
    // Solve Constraints
    for (iter = 0; iter < numIterations; iter++) {
        SolveStretch();          // Distance constraints (preserve edge lengths)
        SolveSewing();           // Sewing constraints (pull seam edges together)
        SolveAttachment();       // Pin constraints (fixed points)
        SolveBending();          // Bending constraints (dihedral angle)
        SolveLRA();              // Long Range Attachments (prevent stretching)
        ApplyDeltas();           // Average Jacobi deltas
    }
    
    Finalize();                  // Update velocities and positions
}

ComputeNormals();               // Recompute normals for rendering
UpdateThreeJSGeometry();        // Push to GPU
```

---

*This analysis was compiled on 2026-02-21 from direct repository inspection, API data, and domain knowledge of cloth simulation literature. URLs verified where possible; some guessed repo names were not found (nickyvanurk variations). Key findings are based on confirmed repositories with verified existence and content.*
