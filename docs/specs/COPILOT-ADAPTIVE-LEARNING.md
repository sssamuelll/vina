# Copilot Spec: Adaptive Learning Skills (User Preference Overrides)

## 1. Overview
Currently, Vina's **Pattern Skills** (e.g., `bodiceSkill.ts`) are static libraries. To achieve the brilliance of **OpenClaw**, the agent must learn from the user's manual corrections. This system enables the Copilot to transition from a generic assistant to a personalized digital partner that understands the specific drafting style and proportions of each pattern maker.

## 2. The Learning Loop
We will implement an observer pattern that monitors the delta between AI-generated geometry and subsequent manual edits by the user.

### Protocol:
1. **AI Action**: Copilot generates a piece using a standard skill formula (e.g., "Waist = WaistCirc / 4 + 2cm").
2. **User Edit**: The user manually modifies a point or dimension (e.g., reduces waist by 1cm).
3. **Preference Extraction**: The agent asks: *"I noticed you reduced the waist ease. Should I remember this preference for future patterns in this project?"*
4. **Override Commit**: If confirmed, the agent writes a **Local Override** to the project state.

## 3. Persistent Overrides
Overrides are stored in a new `local-skills.json` virtual file (IndexedDB) or directly in the Redux `parametricSlice`.

### Override Hierarchy:
1. **Manual User Override** (Highest priority - saved in project).
2. **Global User Preferences** (Medium priority - saved in user profile).
3. **Built-in Skill Library** (Fallback - standard `bodiceSkill.ts`).

## 4. Technical Requirements

### The Override Schema
```typescript
interface SkillOverride {
  skillName: string;
  formulaKey: string;
  originalExpression: string;
  newExpression: string;
  reason?: string;
  scope: 'project' | 'global';
}
```

### Integration Points
- **`src/copilot/skills/skillLoader.ts`**: Update `buildSkillContext` to merge local overrides into the system prompt.
- **`src/store/parametricSlice.ts`**: Store and persist project-specific formula adjustments.

## 5. File Watching & Sychronization
Following OpenClaw's transparency, the user can manually edit the `project-log.md` or a "Preferences" panel to adjust these overrides. The `agentLoop` must re-scan these preferences before every turn to ensure its "Style" is up to date.

## 6. Acceptance Criteria
- After the user corrects the "Neck Width" on a bodice, the Copilot uses that new width automatically for the next "Sleeve" or "Collar" it generates.
- The agent can explain its reasoning: *"I used a 75mm neck width because you adjusted it in the previous step."*
