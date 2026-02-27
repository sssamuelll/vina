# Copilot Spec: Visual Perception & Spatial Awareness

## 1. Overview
Currently, the Copilot only "sees" pieces as abstract IDs and dimensions. To achieve **OpenClaw-level brilliance**, the agent needs a **Spatial Describer** that translates the 3D Scene Graph into semantic relationships. This enables the agent to understand adjacency, overlap, and simulation conflicts.

## 2. The "Spatial Describer" Engine
We will implement a new layer in `contextBuilder.ts` that performs proximity analysis between all pieces in the 3D scene.

### Semantic Mapping Logic
Instead of sending raw XYZ coordinates, the engine will output **Semantic Snapshots**:
- **Adjacency**: "Piece A [Back] edge is within 10mm of Piece B [Front] edge."
- **Overlap**: "Piece C [Sleeve] is currently penetrating the Avatar torso mesh."
- **Orientation**: "Piece D is facing inside-out (normals flipped)."
- **Simulation State**: "Piece E is falling rapidly (unstable) vs Piece F is settled."

## 3. Implementation Strategy: The "Adjacency Matrix"
The `contextBuilder` will compute a lightweight adjacency matrix each time the context is assembled.

### Pseudo-Algorithm
1. Extract the boundary points of all pieces in their **placed 3D positions**.
2. Run a **Spatial Hash query** to find boundary points from different pieces that are within a `proximityThreshold` (e.g., 20mm).
3. Identify if these nearby edges have a `Seam` connection in the store.
4. If they are close but **NOT sewn**, flag it as a "Potential Seam".

## 4. Required Context Updates
The serialized context sent to the LLM will now include a `## Spatial Relationships` section:

```markdown
## Spatial Relationships
- [!] Potential Seam: 'Front_Bodice' (SideEdge) and 'Back_Bodice' (SideEdge) are 5mm apart in 3D but have no sewing connection.
- [OK] Sewn: 'Shoulder_L' is correctly held by seam #123.
- [Warning] Collision: 'Left_Sleeve' is intersecting the avatar arm mesh by 12mm.
```

## 5. Technical Requirements

### New Internal Interfaces
```typescript
interface SpatialConflict {
  type: 'gap' | 'overlap' | 'collision' | 'instability';
  severity: 'low' | 'high';
  affectedPieceIds: string[];
  description: string;
}
```

### Integration Points
- **`src/copilot/contextBuilder.ts`**: The core logic for proximity detection.
- **`src/utils/cloth/pieceClassifier.ts`**: To help the describer use anatomical terms (e.g., "neckline" instead of "edge_0").

## 6. Security & Token Guardrails
- **Limit Results**: Only report the top 5 most relevant spatial relationships.
- **Distance Filtering**: Ignore pieces that are more than 50mm apart unless they are explicitly sewn.
- **Caching**: Proximity analysis is expensive; it should only run if the `simulationState` or `piecePositions` have significantly changed.
