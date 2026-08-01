# Tech Spec: Skill Marketplace Guardrails (Safety & Stability)

## 1. Universal Skill Identifier (NSID)
To avoid name collisions, every skill must use a **Namespace Identifier (NSID)** following the pattern: `author_id:skill_slug`.

### Structure
- **Namespace**: The unique ID of the creator (e.g., `sdar`).
- **Slug**: The specific garment drafting logic (e.g., `stretch_bodice`).
- **Full ID**: `sdar:stretch_bodice`.

## 2. Conflict Resolution Protocol (The Arbiter)
When the user issues a command (e.g., "Draft a skirt") and multiple installed skills match the trigger:

1. **User Preference**: The `skillRegistry` checks if a "Default Provider" is set for the "skirt" category.
2. **Contextual Match**: If no default exists, the Copilot analyzes active piece metadata (e.g., if existing pieces are from `sdar`, prioritize `sdar:skirt`).
3. **Clarification Turn**: If ambiguity persists, the agent MUST ask: *"I have two methods for skirts: 'Basic' by Vina and 'Tailored' by Sdar. Which should I use?"*

## 3. Project Pinning (Stability Guardrail)
Every `.vina` project file must include a `dependencyManifest` to prevent "geometry drift" when skills are updated.

### Manifest Schema
```json
{
  "dependencies": {
    "skills": [
      { "id": "vina:standard_shirt", "version": "1.2.0", "checksum": "a7b8..." }
    ]
  }
}
```

### Execution Rules:
- **Locking**: When a piece is generated, its drafting logic is locked to the current skill version.
- **Update Workflow**: If a newer version is available in the Marketplace, the UI shows a "Update Drafting Logic" badge. It is **never** automatic.
- **Fallback**: If a project references a skill that the user has uninstalled, Vina will prompt to "Temporarily re-activate" or "Convert to static geometry."

## 4. Security Sandbox (Logic Integrity)
To prevent malicious code execution:
- **Declarative Logic**: Skills use a strict JSON-based Domain Specific Language (DSL) for formulas.
- **No Side Effects**: The execution engine (`blueprintExecutor.ts`) is a pure function. It cannot access `window`, `localStorage`, or external APIs.
- **Validation**: Every `.oskill` package is validated against a strict JSON Schema before registration.

## 5. Success Criteria
- Zero "Namespace collisions" even with 100+ installed skills.
- Old projects render identically forever, regardless of Marketplace updates.
- Third-party skills cannot access user data.
