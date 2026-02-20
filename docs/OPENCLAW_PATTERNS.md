# OpenClaw Patterns Worth Stealing

> Summary of architectural patterns from OpenClaw that OpenClo's agent should adopt.

## 1. Layered Identity Architecture

OpenClaw uses a clean layered system for agent behavior:

```
AGENTS.md   → Behavioral rules (when to act, safety, how to wake up)
SOUL.md     → Personality (tone, language, principles)
TOOLS.md    → Local environment notes (credentials, SSH, endpoints)
MEMORY.md   → Long-term curated memory (decisions, context, lessons)
memory/     → Daily raw logs (YYYY-MM-DD.md)
```

**What to steal:** OpenClo's agent needs the equivalent layers:
- `PATRONAJE_SOUL.md` — personality for pattern-making (bilingual, modistería terms, teaching mode)
- Per-project memory — decisions María made on this project, measurements, fabric choices
- Session context — what she's been doing in the last 10 minutes

## 2. Skill System (SKILL.md + scripts + references)

OpenClaw skills are self-contained packages:

```
skills/dev-chronicle/
├── SKILL.md           # When to activate, how to use, full documentation
├── config.json        # Persistent config
├── scripts/           # Executable scripts the agent calls
└── references/        # Static knowledge (voice-profile.md, etc.)
```

Key pattern: SKILL.md acts as both **trigger definition** and **user manual**. The agent reads it to know WHEN to activate and HOW to execute.

**What to steal:** Pattern-making skills as composable packages:
- `skills/bodice-construction/` — Aldrich method, bust dart placement rules, ease tables
- `skills/sleeve-drafting/` — Crown height calculation, cap ease, types (set-in, raglan, dolman)
- `skills/collar-types/` — Shirt collar, stand collar, Peter Pan, shawl — with construction rules
- `skills/grading-rules/` — Standard increment tables per size system (EU, US, UK)
- Each skill has: trigger phrases, parametric formulas, reference images, step-by-step instructions

## 3. Tool System (Function Calling with Structured Params)

OpenClaw connects to tools via structured function calls:
- Each tool has a name, description, and JSON schema for params
- Tools return structured results
- The agent composes multiple tool calls in sequence

OpenClaw's tool calls follow this pattern:
```
User says X → Agent reasons → Agent calls tool(params) → Result → Agent responds
```

**What to steal:** Each OpenClo engine/utility becomes a callable tool with a well-defined schema. The agent doesn't write code — it calls tools.

## 4. State Mutation → Feedback Loop

OpenClaw pattern: Agent action → State changes → Agent observes result → Adjusts

In OpenClo's context:
```
Agent calls createPiece() → Redux dispatch → Canvas re-renders → 
Agent reads updated state → Confirms or adjusts
```

**Critical:** The agent must be able to READ the state AFTER its actions to verify success. The `buildCopilotContext()` function already does this — it serializes current project state into context.

## 5. Memory Across Sessions

OpenClaw uses two tiers:
- `memory/YYYY-MM-DD.md` — raw daily logs
- `MEMORY.md` — curated long-term memory (reviewed periodically)

**What to steal:** Per-project persistent memory:
```json
{
  "projectId": "maria-bodice-2026",
  "decisions": [
    "Used 1.5cm ease because jersey knit",
    "Client wants shorter bodice (-2cm from standard)",
    "Grading from 36 to 46 EU"
  ],
  "lastAction": "Added bust dart to front bodice",
  "measurements": { "chest": 92, "waist": 74 },
  "fabricChoice": "jersey-knit",
  "unfinished": "Need to add sleeve and collar"
}
```

When María opens a project next week, the agent knows exactly where she left off.

## 6. Proactive Behavior

OpenClaw's HEARTBEAT system lets the agent check in and notice things proactively. The agent doesn't just respond — it monitors.

**What to steal:** Agent notices issues without being asked:
- "Esta pieza no tiene margen de costura" (piece missing SA)
- "Las pinzas del delantero y trasero no coinciden en largo" (dart length mismatch)
- "La manga no cabe en la sisa — le faltan 2cm de embebido" (sleeve cap doesn't match armhole)
- "El consumo de tela subió 15% con el último cambio" (fabric usage increased after edit)

## 7. Agent-Agnostic Protocol

OpenClaw is model-agnostic — it works with Claude, GPT, local models. The protocol is the contract, not the model.

OpenClo already has this with `AgentConfig` (http/ws/builtin). **Keep it.** The agent protocol (context in, commands out) is the real product. The LLM is swappable.

## 8. Personality as a Layer, Not Hardcoded

OpenClaw's SOUL.md is separate from behavior rules. This means:
- The agent's competence is in AGENTS.md + tools
- The agent's personality is in SOUL.md
- You can change one without touching the other

**What to steal:** OpenClo's `PATRONAJE_SOUL.md` should be:
- Editable by users (María might want formal Spanish, a student might want casual)
- Separate from the tool definitions
- Loaded as system prompt context, not baked into code

## 9. Configuration Discovery

OpenClaw stores config in `openclaw.json` — one file for auth, agents, channels, plugins. Skills also have `config.json`.

**What to steal:** Agent config stored in the project file or localStorage:
- Preferred language
- Agent endpoint (if external)
- Skill set (which skills are active)
- Teaching mode on/off
- Units preference (mm/cm/inches)

## 10. Composable Tool Chains

OpenClaw agents naturally chain operations: read file → process → write → verify.

**What to steal:** The agent should chain tools for complex workflows:
```
"Hazme un vestido básico y prepáralo para corte"
→ createPiece(bodice_front) 
→ createPiece(bodice_back) 
→ createPiece(skirt_front) 
→ createPiece(skirt_back)
→ addSeamAllowance(all, 10mm)
→ createSeam(bodice_side_to_skirt_side)
→ runNesting(all, fabric_width=150cm)
→ exportDXF(all, AAMA)
```

One user intent → multiple coordinated tool calls → compound result.
