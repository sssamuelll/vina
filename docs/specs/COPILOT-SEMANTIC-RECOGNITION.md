# Tech Spec: Copilot Semantic Recognition Pipeline

## 1. Overview
The Copilot must transition from "Vector Awareness" to "Garment Awareness." This system enables the agent to recognize pattern parts (armholes, necklines, waistbands) autonomously by analyzing geometry, body proximity, and seam topology.

## 2. The Recognition Pipeline

### Step 1: Feature Extraction (The Fingerprint)
For every `PatternPiece`, calculate a **Geometric Profile**:
- **Segment Analysis**: Categorize every edge as `Straight`, `Convex`, or `Concave`.
- **Ratio Mapping**: Calculate length ratios between segments (e.g., Shoulder length vs. Side seam length).
- **Curvature Density**: Identify high-curvature regions (likely necklines or armholes).

### Step 2: Proximity Anchor
Use the `placedMeshes` data to identify the closest **Avatar Bone**.
- Piece near `Spine2` -> Upper Torso.
- Piece near `UpLeg` -> Thigh/Crotch area.

### Step 3: Template Matching (Internalized Knowledge)
Compare the extracted Profile against the **Internalized Skill Library** (Seamly2D converted blocks).
- Match the user's piece to the closest "Archetype" (e.g., "This piece is an 85% match for a Standard Front Bodice").

### Step 4: Semantic Labeling
Apply metadata tags to the piece in the `AgentContext`:
```json
{
  "pieceId": "p123",
  "semanticType": "front_bodice",
  "landmarks": {
    "edge_2": "neckline",
    "edge_4": "armhole",
    "edge_0": "center_front"
  }
}
```

## 3. Implementation Tasks (For Issue #178)
1. **Develop `geometryClassifier.ts`**: A pure utility that calculates curvature and ratios from `PathCommands`.
2. **Upgrade `contextBuilder.ts`**: To inject these semantic labels into the LLM's system prompt.
3. **Internalize Templates**: Repurpose the `seamlyToSkill` output to act as the "Search Index" for recognition.

## 4. Success Criteria
- The user draws a generic bodice. The Copilot says: "I see you're working on a neckline. Should I help you lower the scoop?" without the user tagging the edges.
- The Copilot can detect if a sleeve is being sewn to a neckline (Topological Error).
