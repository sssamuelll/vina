# CLO3D arrange → sew → simulate flow — phased plan

**Fecha:** 2026-05-29
**Decisión de Samuel:** pivote desde "la IA auto-viste un DXF" (que flailea contra el muro de segmentación de aristas) hacia el modelo CLO3D: **el humano controla, la IA asiste.**
**Fundamentado por:** workflow `clo3d-arrange-flow-research` (4 readers + síntesis, grounding file:line).

## El flujo objetivo

```
cargar DXF → IA clasifica + POSICIONA en 3D (modo arrange) → costuras dibujadas
en 3D, visibles ANTES de simular → humano verifica / dibuja las costuras que la
IA no tiene seguras (IA asiste) → humano dispara Simular
```

**La IA NUNCA auto-cose ni auto-simula.** Eso es justo lo que removemos (el flailing de 30-50 tools).

## El hallazgo que lo hace barato

Es reconectar, no construir. Tres primitivos ya existen:
1. **Modo arrange** — `viewMode3D === 'arrange'` renderiza `DraggablePiece` con gizmos; posiciones de `placeGarmentPieces`/`computePlacement` + `arrangementOverrides`.
2. **Cosido manual** — `Sew3DTool` ya hace picking borde→borde + `addSeam`.
3. **Transform de aristas 3D** — `outlineToLocal3D` + `EdgeHighlight` ya existen.

Tres cosas pelean contra el flujo y hay que quitarlas/recablearlas:
- `runGarmentPipeline` auto-cose (minConf 0.6) **Y** dispara `startSimulation()` en una sola llamada, y el bootstrap lo MANDA tras cargar → **ese es el flailing**.
- `dressAvatar` y el botón "Dress" hacen `place → simulate → startSimulation` sin pausa de arrange/sew.
- `showSeamlines3D` (flag Redux, default true) lo togglea `DisplayBar3D` pero **NADIE lo lee** → las costuras son invisibles antes de simular.

## Fases (ordenadas por dependencia, cada una shippable sola)

### Fase 1 — `SeamRenderer3D`: dibujar costuras como líneas 3D en arrange [M] ← MAYOR IMPACTO, primero
Sin esto, "verifica las costuras antes de Simular" es imposible — no hay nada que mirar. Componente R3F nuevo que, por cada `project.seams`, calcula el midpoint world-space de la arista A y B y dibuja una línea (punteada, color de paleta) entre ellas. Reusa `outlineToLocal3D` + el MISMO transform (position/rotation/flip) que aplica `Sew3DTool`. Montar en el Canvas gated en `isArrangeMode && showSeamlines3D && !useClothSim`. **Lee el flag que nadie leía.**
- Riesgo: el transform debe ser EXACTO al de Sew3DTool/EdgeHighlight (si no, las líneas flotan). Mitigación: extraer el transform a un helper compartido. Perf: memoizar por seam id + placements + flip, disponer per RFC C1.
- Archivos: `SeamRenderer3D.tsx` (nuevo), `Viewport3D.tsx`, `utils/3d/edgePicker.ts` (reusar/extraer `edgeMidpoint3D`).

### Fase 2 — tool `arrangeGarment`: posicionar en 3D SIN simular [S]
El entrypoint "solo arreglar" que no existe. `dressAvatar` menos la mitad de simular: lee piezas → `placeGarmentPieces` → `setArrangement3D` por pieza + `saveArrangementSnapshot` → `setViewMode3D('arrange')`. NO `startSimulation`, NO auto-sew.
- Archivos: `3dInteractionTools.ts` (+ reuso de placement/slices).

### Fase 3 — reescribir el bootstrap: arrange → sew-confiable → STOP [M]
Reemplazar el mandato "load → runGarmentPipeline (auto-sew+auto-sim) → verify" por "load → classify → detectEdges → arrangeGarment → createSeam solo en pares confiables → presentToUser pidiendo al humano que verifique/dibuje las inciertas y presione Simular". El agente NUNCA dispara Simular. **La prosa ya describe esto; las reglas MANDATORY lo contradicen** — hay que cambiarlas juntas o el LLM obedece la regla estricta y sigue auto-simulando.
- Archivos: `domainBootstrap.ts`.

### Fase 4 — provenance de costuras: marcar IA-propuesta vs humano-confirmada [M]
`source?: 'ai' | 'human'` (+ `confidence?`) opcional en `Seam` (sin migración; legacy → 'human'). Sew3DTool → 'human', createSeam → 'ai'. `SeamRenderer3D` las estiliza distinto (ej. IA punteada ámbar, humano sólida) → el humano ve qué verificar.
- Archivos: `types.ts`, `Sew3DTool.tsx`, `createSeam` tool, `SeamRenderer3D.tsx`, `projectSlice.ts` (shape comment de persistencia B6).

### Fase 5 — retirar los paths de auto-sew + auto-simulate [M]
`runGarmentPipeline`: auto-sew y auto-start pasan a opt-in (o deprecar). `dressAvatar`: quitar la cola `simulate`+`startSimulation` (alias de arrange). Botón "Dress": repuntar a arrange-only. Dejar el botón Simular manual intacto (trigger humano). Orphan-deletion protocol: neutralizar antes que borrar.
- Archivos: `garmentPipelineTool.ts`, `3dInteractionTools.ts`, `SimModeToggle.tsx`, `domainBootstrap.ts`.

## Riesgos transversales
- **Fase 3+5 acopladas:** las reglas MANDATORY del bootstrap fuerzan `runGarmentPipeline`; cambiar prosa sin las reglas = el agente sigue auto-simulando. Cambiar juntas.
- **Fase 1 coordenadas:** extraer el transform a helper compartido y reusarlo en Sew3DTool + SeamRenderer3D (evita líneas flotantes).
- **Fase 4 persistencia:** `source` opcional, legacy → 'human', shape comment en `storageSet` (B6 IDB).
- **Fase 5 blast radius:** grep refs de dressAvatar/runGarmentPipeline; neutralizar > borrar.
- `createSeam` exact file sin verificar — confirmar antes de Fase 4.

## Orden de ejecución
1 (visibilidad) → 2 (arrange tool) → 3 (agente arrange-no-sim) → 4 (provenance) → 5 (retirar auto-paths). Cada fase commit independiente con gates.
