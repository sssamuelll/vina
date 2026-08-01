# Vina AI Agent — User Guide

> Your AI pattern-making copilot that speaks the language of patronaje.

## Quick Setup

### 1. Open Settings
Click the **⚙️ gear icon** in the Chat panel header.

### 2. Choose a Provider

| Provider | Best For | Cost |
|----------|----------|------|
| **Anthropic (Claude)** | Best quality, understands patronaje deeply | Pay per token |
| **OpenAI (GPT)** | Good alternative, fast responses | Pay per token |
| **Ollama (Local)** | Free, private, runs on your machine | Free |
| **Built-in** | Quick templates, no AI needed | Free |

### 3. Enter API Key
- **Anthropic**: Get your key at [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- **OpenAI**: Get your key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Ollama**: No key needed — just install Ollama and run it locally

### 4. Select a Model
- **Claude Sonnet 4**: Best balance of quality and cost (recommended)
- **Claude Haiku**: Faster, cheaper, great for simple tasks
- **GPT-4o-mini**: Fast and affordable
- **llama3 (Ollama)**: Free local inference

### 5. Save and Start Chatting!

---

## Example Conversations

### 1. Creating a Basic Bodice Block
```
You: Hazme un corpiño base talla 40

Agent: 👚 Voy a generar el bloque base del corpiño para talla EU 40.
       Medidas: busto 92cm, cintura 72cm, cadera 96cm

       ✅ 4 acciones aplicadas:
       🔧 createPiece → Delantero Corpiño (460×580mm)
       🔧 createPiece → Espalda Corpiño (440×580mm)
       🔧 addDart → Pinza de busto (delantero)
       🔧 addGrainline → Línea de hilo vertical

       📚 Las pinzas absorben la diferencia entre busto y cintura.
       La punta va 2-3cm antes del punto de pecho.
```

### 2. Adding a Sleeve
```
You: Add a basic sleeve to this bodice

Agent: 🦾 I'll generate a one-piece sleeve block that matches your bodice.
       Armhole measurement: 420mm, sleeve length: 600mm

       ✅ 2 actions applied:
       🔧 createPiece → Sleeve (340×600mm)  
       🔧 addNotch → 3 alignment notches on sleeve cap

       💡 The sleeve cap ease is 30mm — standard for woven fabrics.
       For knits, you can reduce it to 15-20mm.
```

### 3. Checking Pattern Quality
```
You: Revisa los márgenes de costura

Agent: ⚠️ Encontré estos problemas:
       
       ❌ Falta margen de costura en: Manga (0mm)
       ⚠️ Márgenes inconsistentes: 10mm y 7mm
       💡 Sin piquetes en la costura Delantero ↔ Espalda
       
       ¿Quieres que corrija los márgenes automáticamente?
```

### 4. Grading to Multiple Sizes
```
You: Grade everything from size 36 to 46

Agent: 📏 Grading all pieces from EU 36 to EU 46...
       
       ✅ 12 actions applied (2 rounds):
       Round 1: Generated grade rules for 6 sizes
       Round 2: Applied point-specific grading
       
       Sizes generated: 36, 38, 40 (base), 42, 44, 46
       
       📚 Grading isn't just scaling — each point has different
       increment rules based on anthropometric tables.
```

### 5. Exporting for Production
```
You: Export DXF for the cutting machine

Agent: 📄 Exporting AAMA/ASTM D6673 compliant DXF...
       
       ✅ 1 action applied:
       🔧 exportDXF → vina-project.dxf (12 layers, 6 pieces)
       
       Includes: piece boundaries, seam allowance, notches,
       grainlines, and dart lines. Compatible with Gerber, Lectra,
       and Optitex cutters.
```

---

## What You Can Ask

### Pattern Creation
- "Create a bodice block" / "Hazme un corpiño"
- "Generate a skirt for size 42" / "Genera una falda talla 42"
- "Make me a sleeve" / "Crea una manga"
- "Create pants from my measurements" / "Crear pantalón con mis medidas"
- "Generate a complete dress" / "Genera un vestido completo"

### Modifications
- "Add a dart at the waist" / "Agregar pinza en cintura"
- "Extend the sleeve by 5cm" / "Alargar la manga 5cm"
- "Make the skirt A-line" / "Hacer la falda evasé"
- "Add seam allowance of 15mm" / "Agregar margen de 15mm"

### Analysis & Quality
- "Check seam allowances" / "Revisar márgenes de costura"
- "Analyze this pattern" / "Analizar este patrón"
- "Measure the armhole" / "Medir la sisa"
- "Are the notches aligned?" / "¿Están alineados los piquetes?"

### Grading & Production
- "Grade to size 44" / "Gradar a talla 44"
- "Grade all sizes" / "Gradar todas las tallas"
- "Nest pieces on 150cm fabric" / "Anidar en tela de 150cm"
- "Export DXF" / "Exportar DXF"
- "Export PDF" / "Exportar PDF"

### Settings & Info
- "Show my measurements" / "Ver mis medidas"
- "List available fabrics" / "Listar telas disponibles"
- "Set measurements for size M" / "Configurar medidas talla M"
- "Change fabric to silk" / "Cambiar tela a seda"

---

## Tips for Better Results

1. **Be specific**: "Create a sleeveless A-line dress, EU size 40" works better than "make a dress"
2. **Mention the size**: The agent uses standard EU sizing tables (36-48)
3. **Use patronaje terms**: "pinza", "sisa", "margen de costura" — the agent understands both ES and EN
4. **Ask for explanations**: "Why did you add 1.5cm ease?" — teaching mode explains the reasoning
5. **Check proactive warnings**: Yellow warnings at the top flag issues automatically
6. **Chain actions**: "Create bodice, add darts, set SA to 10mm, add grainline" — multi-step works!

---

## Offline Mode (Ollama)

### Setup
1. Install Ollama: [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull llama3`
3. Start Ollama (it runs in background)
4. In Vina Settings, select "Ollama (Local)" as provider
5. The agent will auto-detect your Ollama instance

### Recommended Models
- **llama3**: Best overall quality for pattern-making
- **mistral**: Good alternative, faster
- **codellama**: Better at understanding structured tool calls
- **mixtral**: Most capable, but slower

### Limitations
- Ollama models don't natively support function calling — we use prompt injection
- Tool calling may be less reliable than Anthropic/OpenAI
- No cost — everything runs locally on your machine

---

## Mobile Usage

On screens smaller than 768px:

- **Full-screen chat**: Tap the expand icon for a full-screen chat experience
- **Swipe down**: Swipe down to minimize from full-screen
- **Quick actions**: Tap chips above the input for common actions ("Nuevo corpiño", "Gradar", etc.)
- **Voice input**: Tap the 🎤 microphone button to dictate your message
- **Compact tools**: Tool calls are collapsed — tap to expand details
- **Haptic feedback**: Feel a subtle vibration when tools execute

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + /` | Focus chat input |
| `Cmd/Ctrl + Shift + /` | Toggle chat panel |
| `Escape` | Return focus to canvas |

These are also available in the Command Palette (`Cmd/Ctrl + K`).

---

## Cost Management

The agent tracks your token usage and estimated costs:

- **Session cost**: Shown in the chat footer ("~$0.03 this session")
- **Project cost**: Visible in Settings → Token Usage
- **Monthly budget**: Set a limit in Settings (default $5/month)
- **Budget warnings**: Alert at 80% and 100% of your budget
- **Smart routing**: Simple queries (list, show) use cheaper models automatically

### Estimated Costs (per interaction)
| Model | Simple Query | Complex Query |
|-------|-------------|---------------|
| Claude Haiku | ~$0.001 | ~$0.005 |
| Claude Sonnet | ~$0.005 | ~$0.03 |
| GPT-4o-mini | ~$0.0005 | ~$0.003 |
| Ollama | Free | Free |

---

## Troubleshooting

### "API key is invalid or expired"
Go to Settings → update your API key. Make sure you're using the correct key for your selected provider.

### "Network error"
Check your internet connection. If using Ollama, make sure it's running (`ollama serve`).

### "Rate limit reached"
Wait a moment and try again, or switch to a different model. Haiku/GPT-4o-mini have higher rate limits.

### "Tool error"
The agent will explain what went wrong and suggest alternatives. Some operations require specific pieces to be selected.

### "Ollama not running"
Start Ollama with `ollama serve` or install it from [ollama.com](https://ollama.com). The Settings panel shows the connection status.
