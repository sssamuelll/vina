# Realistic Cloth Simulation - Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make cloth simulation look and behave like real fabric while maintaining 60fps performance.

**Architecture:** Extend existing XPBD solver with air drag, anisotropic properties, and per-fabric damping.

**Tech Stack:** Rust (WASM), TypeScript, Three.js

**Epic Issue:** #198

---

## Research Summary

### Sources Studied

1. **Academic Papers**
   - XPBD: Position-Based Simulation of Compliant Constrained Dynamics (Macklin & Müller, 2016)
   - Position Based Dynamics (Müller et al., 2007)
   - Bridson: Robust Treatment of Collisions, Contact and Friction for Cloth Animation

2. **Reference Implementations**
   - Ten Minute Physics Tutorial 14 & 15 (Matthias Müller)
   - PositionBasedDynamics library (InteractiveComputerGraphics)
   - Carmen Cincotti's XPBD blog series

3. **Industry Standard**
   - CLO3D / Marvelous Designer behavior analysis
   - CLO3D Fabric Properties documentation

### Key Findings

#### Bending Model
- **Distance-based bending is sufficient** - Carmen Cincotti's research shows it's equally good and more performant than dihedral angle bending
- No need to change our current bending model

#### Air Resistance (CRITICAL GAP)
- Neither Ten Minute Physics nor our implementation has air drag
- This is why cloth "floats" and doesn't settle naturally
- Formula: `F = ½ρv²CdA(n·v̂)` per triangle

#### Anisotropic Properties (MAJOR GAP)
- CLO3D models Warp/Weft/Shear separately for stretch
- CLO3D models Warp/Weft separately for bending
- This differentiates cotton from silk from denim

#### Internal Damping
- CLO3D has explicit per-fabric damping parameter
- We only have global velocity * 0.99

---

## Gap Analysis

| Feature | CLO3D | OpenCLO | Ten Minute Physics | Priority |
|---------|-------|---------|-------------------|----------|
| Air Drag | ✅ | ❌ | ❌ | P0 Critical |
| Anisotropic Stretch | ✅ Warp/Weft/Shear | ❌ Isotropic | ❌ Isotropic | P1 Important |
| Anisotropic Bending | ✅ Warp/Weft | ❌ Isotropic | ❌ Isotropic | P2 Important |
| Internal Damping | ✅ Per-fabric | ⚠️ Global | ⚠️ Implicit | P3 Enhancement |
| Bending Model | Distance | Distance | Distance | ✅ Equal |
| Substeps | Variable | 15 | 15 | ✅ Similar |

---

## Technical Design

### P0: Air Drag per Triangle

**Location in solver loop:** `preSolve()`, before position integration

**Algorithm:**
```
for each triangle (v0, v1, v2):
    // 1. Calculate triangle properties
    velocity = (vel[v0] + vel[v1] + vel[v2]) / 3
    normal = normalize(cross(pos[v1] - pos[v0], pos[v2] - pos[v0]))
    area = length(cross(pos[v1] - pos[v0], pos[v2] - pos[v0])) / 2

    // 2. Calculate drag force
    speed = length(velocity)
    if speed < 0.001: continue

    velocityDir = velocity / speed
    facingFactor = abs(dot(normal, velocityDir))  // 0 if parallel, 1 if perpendicular

    // F = ½ρv²CdA
    dragMagnitude = 0.5 * airDensity * speed² * dragCoeff * area * facingFactor
    dragForce = -velocityDir * dragMagnitude

    // 3. Distribute to vertices (equal distribution)
    forcePerVertex = dragForce / 3
    vel[v0] += forcePerVertex * invMass[v0] * dt
    vel[v1] += forcePerVertex * invMass[v1] * dt
    vel[v2] += forcePerVertex * invMass[v2] * dt
```

**Parameters:**
- `airDensity`: 1.225 kg/m³ (sea level)
- `dragCoefficient`: 1.0 default, range 0.0 - 2.0

**Performance:** O(numTriangles) - minimal impact

---

### P1: Anisotropic Stretch

**Concept:** Classify each stretch constraint by its direction relative to fabric grain (UV space or world space angle).

**Direction Classification:**
- **Warp (0°):** Vertical edges (along V axis)
- **Weft (90°):** Horizontal edges (along U axis)
- **Shear (45°):** Diagonal edges

**Implementation:**
```typescript
interface AnisotropicStretch {
  stretchWarp: number;   // Compliance for vertical (0.0 = stiff)
  stretchWeft: number;   // Compliance for horizontal
  stretchShear: number;  // Compliance for diagonal (usually higher)
}

// In constraint setup:
for each edge (v0, v1):
    angle = atan2(uv[v1].v - uv[v0].v, uv[v1].u - uv[v0].u)
    if abs(angle) < 22.5° or abs(angle) > 157.5°:
        constraint.compliance = fabric.stretchWeft
    else if abs(angle - 90°) < 22.5° or abs(angle + 90°) < 22.5°:
        constraint.compliance = fabric.stretchWarp
    else:
        constraint.compliance = fabric.stretchShear
```

**Typical Values:**
| Fabric | Warp | Weft | Shear |
|--------|------|------|-------|
| Cotton | 0.0 | 0.0 | 0.001 |
| Silk | 0.001 | 0.001 | 0.01 |
| Jersey | 0.01 | 0.05 | 0.1 |
| Denim | 0.0 | 0.0 | 0.0001 |

---

### P2: Anisotropic Bending

**Concept:** Same approach as stretch - classify bend constraints by edge direction.

**Implementation:**
```typescript
interface AnisotropicBending {
  bendWarp: number;   // Compliance for bending along warp
  bendWeft: number;   // Compliance for bending along weft
}

// Bend constraint is defined by shared edge between triangles
// Classify by that edge's direction
```

**Typical Values:**
| Fabric | Warp | Weft |
|--------|------|------|
| Cotton | 1.0 | 1.0 |
| Silk | 5.0 | 5.0 |
| Denim | 0.1 | 0.1 |

---

### P3: Internal Damping per Fabric

**Current:** Global `damping = 0.99` applied to all velocities

**Proposed:** Per-fabric `internalDamping` parameter

```typescript
interface PhysicalFabric {
  // ... existing properties
  internalDamping: number;  // 0.0 (no damping) to 1.0 (heavy damping)
}

// In preSolve:
const dampingFactor = 1.0 - fabric.internalDamping * 0.1;  // Maps to 0.9-1.0
velocity *= dampingFactor;
```

**Typical Values:**
| Fabric | Internal Damping |
|--------|-----------------|
| Silk | 0.1 |
| Cotton | 0.3 |
| Jersey | 0.4 |
| Denim | 0.6 |
| Leather | 0.8 |

---

## Files to Modify

### Core Solvers
- `crates/xpbd-wasm/src/lib.rs` - Rust WASM solver
- `src/utils/cloth/xpbdSolver.ts` - TypeScript JS solver

### Configuration
- `src/utils/cloth/physicalFabric.ts` - Add new properties
- `src/utils/cloth/fabricLibrary.ts` - Update presets

### Worker Interface
- `src/utils/cloth/wasm/wasmSolverWorker.ts` - Pass new parameters
- `src/utils/cloth/wasm/wasmSolverClient.ts` - Client interface

---

## Performance Budget

| Feature | Cost per Frame | Impact |
|---------|---------------|--------|
| Air Drag | O(triangles) | ~0.5ms for 10k triangles |
| Anisotropic Stretch | O(edges) | ~0ms (same work, different values) |
| Anisotropic Bending | O(bend constraints) | ~0ms (same work, different values) |
| Internal Damping | O(particles) | ~0ms (already computed) |

**Total estimated impact:** < 1ms per frame at 60fps budget (16.67ms)

---

## Success Criteria

1. **Air Drag:** Cloth falls and settles within 2-3 seconds, doesn't float
2. **Anisotropic Stretch:** Visible difference between cotton and jersey under same force
3. **Anisotropic Bending:** Folds form along grain direction
4. **Internal Damping:** Silk oscillates noticeably more than denim

---

## References

- [Ten Minute Physics - Cloth](https://matthias-research.github.io/pages/tenMinutePhysics/14-cloth.html)
- [XPBD Paper](https://matthias-research.github.io/pages/publications/XPBD.pdf)
- [Carmen Cincotti - Bending Constraints](https://carmencincotti.com/2022-09-05/the-most-performant-bending-constraint-of-xpbd/)
- [CLO3D Stretch Properties](https://support.clo3d.com/hc/en-us/articles/115000483087-Adjust-Stretch-Weft-Warp-Shear)
- [Air Drag Formula](https://en.wikipedia.org/wiki/Drag_equation)
