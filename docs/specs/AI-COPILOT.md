# OpenClo — AI Copilot Spec

## Overview

The AI copilot is OpenClo's unfair advantage over legacy software. CLO3D has 15 years of features — we have AI that makes half those features unnecessary.

**Key principle:** The copilot doesn't replace the pattern maker — it removes tedium and accelerates iteration.

## Capabilities

### Tier 1: Pattern Generation (implemented v0.4)
- "Crea un cuerpo base talla 40" → parametric bodice template
- "Manga raglan, largo 60cm" → sleeve piece with correct cap shape
- "Falda acampanada, cintura 72" → A-line skirt pieces

### Tier 2: Pattern Modification (next)
- "Hazlo 2cm más largo" → extend selected piece
- "Añade una pinza en el busto" → insert dart at correct position
- "Reduce la sisa 5mm" → modify armhole curve
- "Ensancha las caderas" → adjust hip measurement, regenerate

### Tier 3: Intelligent Assistance (planned)
- "¿Esta manga encaja con la sisa?" → measure edge lengths, warn if mismatch
- "Optimiza el corte para tela de 150cm" → marker layout suggestion
- "Revisa los márgenes de costura" → audit seam allowances across all pieces
- Import a photo → suggest pattern pieces that approximate the garment

### Tier 4: AI-Native Features (future)
- Photo → pattern: upload garment photo, AI generates approximate pattern pieces
- Body scan → avatar: camera input → 3D body model
- Fit prediction: given body measurements + pattern, predict fit issues before simulation
- Style transfer: "Make this bodice more like Balenciaga" → modify proportions

## Architecture

### Agent-Agnostic Protocol

The copilot doesn't know or care which LLM is behind it. It communicates through a protocol layer:

```
User message
    ↓
Chat Panel (React component)
    ↓
Protocol Layer (buildCopilotContext)
    ├── Current pieces (names, measurements, outlines)
    ├── Selected piece details
    ├── Active tool
    ├── Recent actions (undo history)
    └── Available commands
    ↓
LLM Provider (Claude, GPT, local model, etc.)
    ↓
Response with commands (JSON)
    ↓
Command Executor
    ├── createPiece → Redux dispatch
    ├── modifyPiece → Redux dispatch
    ├── deletePiece → Redux dispatch
    ├── selectTool → Redux dispatch
    ├── addDart → geometric calculation → dispatch
    ├── measureEdge → calculation → display result
    └── explain → text response only
    ↓
State updates → UI re-renders
```

### Command Schema

```typescript
interface CopilotCommand {
  action: 'createPiece' | 'modifyPiece' | 'deletePiece' |
          'addDart' | 'addNotch' | 'addSeam' |
          'selectTool' | 'setMeasurement' |
          'measureEdge' | 'auditSeams' | 'explain';
  params: Record<string, any>;
}
```

### Context Window Management

Pattern data can be large. Context strategy:
1. **Always include:** piece names, count, active selection, measurements summary
2. **On demand:** full outline paths (only for selected piece or when modification requested)
3. **Never include:** raw mesh data, simulation state, texture data

Estimated context per project:
- 5 pieces, names + measurements: ~500 tokens
- 5 pieces, full outlines: ~3000 tokens
- 20 pieces, full outlines: ~12000 tokens

### Provider Configuration

```typescript
interface CopilotConfig {
  provider: 'anthropic' | 'openai' | 'local' | 'custom';
  apiKey?: string;
  model?: string;
  endpoint?: string;  // for custom/local providers
  systemPrompt?: string;  // override default
}
```

No agent configured → chat panel shows setup prompt only, no input bar.

## UX Principles

1. **Chat, not commands** — natural language, not CLI syntax
2. **Show, don't just tell** — when AI creates a piece, it appears immediately in the editor
3. **Undo-friendly** — every AI action is a single undo step
4. **Bilingual** — understands Spanish and English pattern terminology
5. **Suggestions** — after each action, suggest logical next steps as quick-action buttons
6. **No hallucination tolerance** — if unsure about a measurement, ask rather than guess

## Fashion Terminology Mapping

The copilot must understand pattern-making terms in multiple languages:

| English | Spanish | French | Technical |
|---------|---------|--------|-----------|
| Bodice | Cuerpo / Corpiño | Corsage | front_bodice / back_bodice |
| Dart | Pinza | Pince | dart |
| Armhole | Sisa | Emmanchure | armhole_curve |
| Seam allowance | Margen de costura | Marge de couture | seam_allowance_mm |
| Grainline | Hilo de la tela | Droit fil | grainline |
| Notch | Piquete | Cran | notch |
| Ease | Holgura / Desahogo | Aisance | ease_mm |
| Yoke | Canesú | Empiècement | yoke |
| Placket | Tapeta | Patte de boutonnage | placket |
| Gusset | Nesga | Soufflet | gusset |
| Welt | Vivo | Passepoil | welt |
| Facing | Vista / Enfrentado | Parementure | facing |
| Lining | Forro | Doublure | lining |
| Interfacing | Entretela | Entoilage | interfacing |
