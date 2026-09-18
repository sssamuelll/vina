# Fabric Calibration Guide

> How to tune fabric parameters for realistic cloth simulation

## Quick Reference

| Fabric Type | Stretch Warp | Stretch Weft | Bend Warp | Bend Weft | Internal Damping |
|-------------|--------------|--------------|-----------|-----------|------------------|
| Silk/Chiffon | 4-6% | 6-8% | 0.05-0.1 | 0.04-0.08 | 0.1 |
| Cotton Poplin | 2% | 3% | 0.6-0.8 | 0.4-0.5 | 0.3 |
| Jersey Knit | 8% | 40% | 0.15-0.2 | 0.1-0.15 | 0.4 |
| Denim | 1% | 2% | 2.8-3.5 | 2.0-2.8 | 0.6 |
| Leather | 15% | 25% | 4.0-5.0 | 3.0-4.0 | 0.8 |

---

## Parameter Definitions

### Stretch Properties (% Elongation)

- **stretchWarp**: Stretch along the grain (vertical, lengthwise threads)
- **stretchWeft**: Stretch across the grain (horizontal, crosswise threads)
- **stretchBias**: Stretch at 45° diagonal

**Rule of thumb:**
- Wovens: 1-5% stretch
- Knits: 10-80% stretch
- Weft usually stretches more than warp

### Bending Rigidity (mN·cm)

- **bendingWarp**: Resistance to bending along grain
- **bendingWeft**: Resistance to bending across grain

**Conversion to compliance:**
```
compliance = 1 / (bendingValue + 0.05)
```

| Value | Fabric Feel |
|-------|-------------|
| 0.02-0.1 | Extremely fluid (chiffon, tulle) |
| 0.1-0.5 | Light and drapey (silk, voile) |
| 0.5-1.5 | Medium body (cotton, jersey) |
| 1.5-4.0 | Structured (denim, gabardine) |
| 4.0-8.0 | Stiff (canvas, neoprene) |

### Internal Damping (0.0-1.0)

Controls how quickly oscillations settle.

| Value | Behavior |
|-------|----------|
| 0.0-0.2 | Fluid, oscillates freely (silk, chiffon) |
| 0.2-0.4 | Light settling (cotton, linen) |
| 0.4-0.6 | Moderate settling (jersey, ponte) |
| 0.6-0.8 | Heavy settling (denim, scuba) |
| 0.8-1.0 | Almost no oscillation (leather, felt) |

---

## Calibration Process

### Step 1: Identify Fabric Category

1. **Woven or Knit?**
   - Wovens: Low stretch, directional
   - Knits: High stretch, recovery

2. **Weight class?**
   - Lightweight: < 150 GSM
   - Medium: 150-300 GSM
   - Heavy: > 300 GSM

3. **Hand feel?**
   - Fluid, crisp, or structured?

### Step 2: Set Base Values

Start with a similar fabric preset:

```typescript
const customFabric: PhysicalFabric = {
  ...getPhysicalFabric('cotton-poplin'), // Start from closest match
  id: 'my-custom-fabric',
  name: 'My Custom Fabric',
  // Override specific values...
};
```

### Step 3: Test and Adjust

1. **Drop Test**: Let cloth fall from height
   - Falls too slowly? → Increase weight or decrease drag
   - Floats too long? → Increase `internalDamping`

2. **Drape Test**: Drape over body/mannequin
   - Too stiff? → Decrease bending values
   - Too floppy? → Increase bending values

3. **Stretch Test**: Pull corners
   - Too stretchy? → Decrease stretch compliance
   - Too rigid? → Increase stretch compliance

4. **Settling Test**: Watch oscillations
   - Oscillates too long? → Increase `internalDamping`
   - Settles too fast? → Decrease `internalDamping`

---

## Real-World Measurement Sources

### Kawabata Evaluation System (KES)

The gold standard for fabric properties:
- Tensile (stretch)
- Shear
- Bending
- Compression
- Surface

### FAST System (Fabric Assurance by Simple Testing)

Simplified alternative to KES:
- Bending length (overhang test)
- Extensibility
- Formability

### Manual Tests

**Overhang/Drape Test:**
1. Lay fabric on table edge
2. Measure overhang before fabric bends
3. Longer = stiffer

**Stretch Test:**
1. Cut 10cm strip
2. Pull with known weight
3. Measure elongation

---

## Common Fabric Profiles

### Cotton Poplin (Dress Shirt)
```
stretchWarp: 2, stretchWeft: 3, stretchBias: 12
bendingWarp: 0.8, bendingWeft: 0.5
internalDamping: 0.3
```
Crisp hand, moderate drape, quick settling.

### Silk Charmeuse (Evening Dress)
```
stretchWarp: 4, stretchWeft: 6, stretchBias: 18
bendingWarp: 0.1, bendingWeft: 0.08
internalDamping: 0.1
```
Extremely fluid, high drape, oscillates.

### Denim 12oz (Jeans)
```
stretchWarp: 1, stretchWeft: 2, stretchBias: 8
bendingWarp: 3.5, bendingWeft: 2.8
internalDamping: 0.6
```
Stiff, minimal drape, heavy settling.

### Cotton Jersey (T-Shirt)
```
stretchWarp: 8, stretchWeft: 40, stretchBias: 25
bendingWarp: 0.2, bendingWeft: 0.15
internalDamping: 0.4
```
High cross-stretch, soft drape, moderate recovery.

### Ponte Roma (Structured Knit)
```
stretchWarp: 5, stretchWeft: 25, stretchBias: 15
bendingWarp: 0.6, bendingWeft: 0.4
internalDamping: 0.45
```
Structured knit, holds shape better than jersey.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| Cloth floats forever | No air drag or low damping | Increase `dragCoefficient` or `internalDamping` |
| Cloth explodes | Compliance too high | Decrease stretch/bend compliance |
| Cloth too stiff | Bending too high | Decrease bending values |
| Cloth stretches weird | Edge classification wrong | Check UV mapping |
| No directional behavior | Anisotropic params not set | Set separate warp/weft values |

---

## Adding Custom Fabrics

```typescript
import { PHYSICAL_FABRIC_LIBRARY, type PhysicalFabric } from './physicalFabric';

const myFabric: PhysicalFabric = {
  id: 'my-custom-silk',
  name: 'Custom Silk Blend',
  nameEs: 'Mezcla de Seda Personalizada',
  composition: '70% Silk 30% Cotton',
  weaveType: 'satin',
  weight: 95,
  thickness: 0.2,

  // Stretch
  stretchWarp: 5,
  stretchWeft: 7,
  stretchBias: 16,
  recoveryRate: 0.45,

  // Bending
  bendingWarp: 0.15,
  bendingWeft: 0.12,
  drapeCoefficient: 0.85,

  // Surface
  friction: 0.3,
  frictionBody: 0.25,
  internalDamping: 0.15,
  surfaceRoughness: 0.1,

  // ... other required properties
};

// Add to library
PHYSICAL_FABRIC_LIBRARY.push(myFabric);
```
