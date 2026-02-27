# Construction Engine V2: Reactive Design Spec

## 1. Overview
The current construction engine is a "one-shot" generator that breaks piece identity and requires manual updates. V2 transforms this into a **Reactive Synchronization Loop** where construction data and design geometry are perfectly aligned and persistent.

## 2. The Identity Bridge (Fixing #155)
We must link the **Construction Piece (CPiece)** to the **Final Pattern (PatternPiece)** via a stable ID mapping.

### Current Problem:
- `buildPiece` returns a new `PatternPiece` with a random `uid()`.
- Simulation loses reference to the old piece and seams detach.

### V2 Solution:
- The `parametricSlice` will maintain a `pieceMap: Record<CPieceID, PatternPieceID>`.
- `buildPiece` will perform an **upsert** logic:
  - If `pieceMap[cPiece.id]` exists, update ONLY the `outline` and `updatedAt`.
  - If it does not exist, create a new piece and register the mapping.

## 3. Reactive Resolver Middleware (Fixing #154)
A Redux Middleware will automate the update lifecycle.

### Execution Flow:
1. **Trigger**: Action `project/setMeasurements` or `construction/setVariable` is dispatched.
2. **Resolve**: Middleware calls `resolveConstructionPoints` using the new state.
3. **Build**: Middleware calls `buildPiece` for every `CPiece` in the construction state.
4. **Commit**: A single batch action `project/updateMultipleOutlines` is dispatched to the store.

## 4. Visual Integrity & Coordinate Stability (Fixing #156)
We will remove the normalization step from `pieceBuilder.ts` to enable **WYSIWYG** (What You See Is What You Get) editing.

### Changes:
- **Absolute Coordinates**: The `outline` points will remain in the absolute space of the construction engine (e.g., if a point is at 500,500 in construction, it stays at 500,500 in the SVG).
- **Transformation Separation**: Scaling and piece-level positioning (X,Y translation) will be handled by the editor's view matrix, not by modifying the path data.

## 5. Implementation Roadmap
1. **Phase 1**: Update `pieceBuilder.ts` to accept target IDs and remove normalization.
2. **Phase 2**: Implement the `ConstructionMiddleware` for auto-resolution.
3. **Phase 3**: Migrate the 2D Editor to handle absolute coordinate overlays.

## 6. Success Criteria
- Sliding a measurement slider (e.g., "Waist") results in a **smooth, continuous deformation** of the 3D garment.
- Seams remain attached during parametric modifications.
- Clicking a construction point allows direct editing of the linked pattern segment.
