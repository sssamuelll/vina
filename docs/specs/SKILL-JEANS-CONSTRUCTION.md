# Fashion Knowledge Spec: 5-Pocket Jeans Construction (JeansSkill)

## 1. Overview
This specification defines the technical drafting logic for a standard 5-pocket denim jean. It covers the transformation of body measurements into a complex assembly of 9+ pieces (Front, Back, Yoke, Pockets, Fly, Waistband).

## 2. Required Measurements
The following variables must be available in the `AgentContext`:
- `waistCirc`: Natural waist circumference.
- `hipCirc`: Fullest part of the hips (Seat).
- `bodyRise`: Crotch depth (waist to chair while sitting).
- `inseam`: Crotch to floor.
- `outseam`: Waist to floor.
- `kneeCirc`: Desired circumference at knee level.
- `bottomWidth`: Desired leg opening width.

## 3. Geometric Formulas

### Front Piece
- **Crotch Line (Y)**: `bodyRise - waistbandWidth` (Standard: 40mm).
- **Waist Width (X)**: `(waistCirc / 4) + 12.5mm` (Ease).
- **Crotch Extension**: `(hipCirc / 12) + 10mm`.
- **Knee Position (Y)**: `(CrotchToHem / 2) - 50mm`.

### Back Piece
- **Back Rise Tilt**: Inward 20mm, Upward 20mm from Center Back top.
- **Back Hip Width**: `(hipCirc / 4) + 5mm`.
- **Leg Width**: `FrontLegWidth + 10mm` (to wrap side seams forward).

### The Yoke (Back Piece)
- **Drafting**: A V-shaped cutout from the top of the back piece.
- **Height at Center Back**: 60-80mm.
- **Height at Side Seam**: 30-40mm.
- **Function**: Replaces the waist dart for anatomical shaping.

## 4. Construction Steps (Copilot Logic)

1. **Base Block**: Generate a standard trouser block using `bodyRise` and `hipCirc`.
2. **Rise Adjustment**: Lower the front waist by 10mm for a modern fit.
3. **Yoke Separation**: Split the back piece to create the yoke.
4. **Pocket Placement**:
   - **Front J-stitch**: Curve starting 35mm from side seam.
   - **Coin Pocket**: Rectangular patch (50x60mm) on Right Front.
   - **Back Patch Pockets**: Placed 20mm below yoke seam, centered.
5. **Fly Construction**: Add a 40mm wide extension to the center front crotch curve.
6. **Grainline**: Ensure a perfectly vertical grainline centered on the leg.

## 5. Industrial Standards (AAMA/ISO)
- **Seam Allowance**: 
  - 15mm for inseam/outseam (flat-felled).
  - 10mm for waistband and pockets.
- **Notches**: 
  - Knee level (Front/Back).
  - Hip level.
  - Fly termination point.

## 6. Wasm Simulation Parameters
- **Fabric**: `denim-heavy` or `denim-stretch`.
- **Stiffness**: High stretch compliance, medium bend compliance.
- **Friction**: High (denim on skin/denim).
