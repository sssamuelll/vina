# Cloth Simulation Research Archive

> Research conducted for Epic #198: Realistic Cloth Simulation

## Executive Summary

OpenCLO's cloth simulation now matches CLO3D's physics model through four key improvements:

| Feature | Before | After | Impact |
|---------|--------|-------|--------|
| Air Drag | None (cloth floats) | Per-triangle drag | Natural settling |
| Stretch | Isotropic | Warp/Weft/Shear | Fabric-specific behavior |
| Bending | Isotropic | Warp/Weft | Directional fold formation |
| Damping | Global 0.99 | Per-fabric 0.1-0.9 | Material-specific oscillation |

---

## Research Sources

### Academic Papers

1. **XPBD: Position-Based Simulation of Compliant Constrained Dynamics**
   - Authors: Miles Macklin, Matthias Müller (2016)
   - Key insight: Compliance-based constraints for stable simulation
   - Used for: Constraint formulation

2. **Position Based Dynamics**
   - Authors: Müller, Heidelberger, Hennix, Ratcliff (2007)
   - Key insight: Position-based approach vs force-based
   - Used for: Core solver architecture

3. **Robust Treatment of Collisions, Contact and Friction for Cloth Animation**
   - Author: Robert Bridson
   - Used for: Collision handling concepts

### Reference Implementations

1. **Ten Minute Physics Tutorial 14 & 15**
   - Author: Matthias Müller
   - URL: https://matthias-research.github.io/pages/tenMinutePhysics/
   - Key insight: Distance-based bending is sufficient
   - Gap found: No air drag implementation

2. **Carmen Cincotti XPBD Blog Series**
   - URL: https://carmencincotti.com/
   - Key insight: Distance bending equally good as dihedral angle
   - Performance: 2x faster than angle-based

3. **PositionBasedDynamics Library**
   - Source: InteractiveComputerGraphics/PositionBasedDynamics
   - Used for: Implementation patterns

### Industry Analysis

1. **CLO3D / Marvelous Designer**
   - Behavior analysis through UI inspection
   - Fabric properties documentation
   - Key features: Warp/Weft separation, air drag, per-fabric damping

---

## Physics Model

### Air Drag Formula

Per-triangle drag force:

```
F_drag = 0.5 * rho * |v|^2 * Cd * A * (n . v_hat)

Where:
  rho = 1.225 kg/m³ (air density at sea level)
  v = average velocity of triangle's 3 vertices
  Cd = drag coefficient (default 1.0, range 0.0-2.0)
  A = triangle area
  n = triangle surface normal
  v_hat = normalized velocity direction
  (n . v_hat) = orientation factor (0 when parallel, 1 when perpendicular)
```

**Implementation location:** `preSolve()`, before position integration

**Force distribution:** Divided equally among triangle's 3 vertices

### Anisotropic Stretch

Edge classification by direction in UV space:

| Direction | UV Angle | Typical Compliance |
|-----------|----------|-------------------|
| Warp (vertical) | 67.5° - 112.5° | 0.0 (stiff) |
| Weft (horizontal) | -22.5° - 22.5° or 157.5° - 202.5° | 0.0 (stiff) |
| Shear (diagonal) | Everything else | 0.001 (stretchy) |

**Edge type classification:**
```
angle = atan2(dv, du)  // UV space direction

if |angle| < 22.5° or |angle| > 157.5° → WEFT
if |angle - 90°| < 22.5° → WARP
else → SHEAR
```

### Anisotropic Bending

Bend constraints classified by their shared edge direction:
- Same UV classification as stretch
- Shear edges use WEFT compliance (reasonable default)

### Internal Damping

Per-fabric velocity damping:

```
velocity *= (1.0 - internalDamping * 0.1)

Where internalDamping:
  0.0 = fluid, oscillates freely (silk, chiffon)
  0.5 = moderate settling (cotton, jersey)
  1.0 = heavy, settles quickly (denim, leather)
```

---

## Implementation Files

### Core Solvers

| File | Language | Changes |
|------|----------|---------|
| `crates/xpbd-wasm/src/lib.rs` | Rust | Air drag, anisotropic constraints, internal damping |
| `src/utils/cloth/xpbdSolver.ts` | TypeScript | Same (JS fallback) |

### Configuration

| File | Purpose |
|------|---------|
| `src/utils/cloth/physicalFabric.ts` | Physical properties + 32 fabric presets |
| `src/utils/cloth/ClothSimConfig.ts` | Simulation parameters |

### Constraint Extraction

| File | Purpose |
|------|---------|
| `src/utils/cloth/gpu/gpuBuffers.ts` | `extractStretchConstraints()`, `extractBendConstraints()` with UV-based edge type classification |

### Worker Interface

| File | Purpose |
|------|---------|
| `src/utils/cloth/wasm/wasmSolverWorker.ts` | Passes anisotropic params to WASM |
| `public/wasm/xpbd_wasm.js` | WASM bindings (must match Rust API) |

---

## Fabric Presets

32 fabrics with calibrated physics parameters:

| Category | Fabrics | Key Characteristics |
|----------|---------|-------------------|
| Wovens - Plain | Poplin, Broadcloth, Muslin, Voile | Low stretch, medium drape |
| Wovens - Twill | Denim, Stretch Denim, Gabardine, Chino | Sturdy, diagonal texture |
| Wovens - Satin | Silk Charmeuse, Duchess Satin | High sheen, fluid/structured |
| Knits | Jersey, Ponte Roma, Rib, Lycra, Scuba | High stretch, recovery |
| Sheer | Organza, Chiffon, Tulle | Lightweight, translucent |
| Natural | Linen, Wool Crepe, Wool Flannel | Varied drape and structure |
| Heavy | Canvas, Ripstop Nylon | Stiff, workwear |
| Leather | Lambskin, Faux Leather | Heavy damping, minimal stretch |
| Specialty | Neoprene, Felt, Fleece, Velvet | Unique behavior |
| Linings | Polyester Lining, Fusible Interfacing | Support fabrics |

---

## Performance Analysis

| Feature | Complexity | Impact at 10k triangles |
|---------|-----------|------------------------|
| Air Drag | O(triangles) | ~0.5ms |
| Anisotropic Stretch | O(edges) | ~0ms (same work, different values) |
| Anisotropic Bending | O(bend constraints) | ~0ms (same work, different values) |
| Internal Damping | O(particles) | ~0ms (already computed) |

**Total impact:** < 1ms per frame (60fps budget = 16.67ms)

---

## Validation Criteria

1. **Air Drag:** Cloth settles within 2-3 seconds, no floating
2. **Anisotropic Stretch:** Cotton visibly different from jersey under same force
3. **Anisotropic Bending:** Folds form along grain direction
4. **Internal Damping:** Silk oscillates more than denim before settling

---

## References

- [Ten Minute Physics - Cloth Tutorial](https://matthias-research.github.io/pages/tenMinutePhysics/14-cloth.html)
- [XPBD Paper (PDF)](https://matthias-research.github.io/pages/publications/XPBD.pdf)
- [Carmen Cincotti - Bending Constraints](https://carmencincotti.com/2022-09-05/the-most-performant-bending-constraint-of-xpbd/)
- [CLO3D Fabric Properties](https://support.clo3d.com/hc/en-us/articles/115000483087-Adjust-Stretch-Weft-Warp-Shear)
- [Drag Equation (Wikipedia)](https://en.wikipedia.org/wiki/Drag_equation)
