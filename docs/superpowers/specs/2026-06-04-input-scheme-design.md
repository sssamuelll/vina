# InputScheme — Presets de input Mouse/Trackpad (Fase 2)

**Fecha:** 2026-06-04
**Estado:** Diseño aprobado (brainstorm con Samuel; consenso del council 2026-06-04: Halberg / Serrano / Stride)
**Predecesor:** Fase 1 commiteada en `0e4c3033` (`feat/trackpad-input-fase1`): pan 3D vía ⌥+drag, presets de cámara top-row, `src/components/Viewport3D/inputBindings.ts`.
**Sucesor (fase 3, fuera de scope):** precision-drag (pen bezier, pose joints, gizmos), tooltips hover-only, dep `react-zoom-pan-pinch` sin uso (candidato Vex).

## Problema

La app es apenas funcional en un laptop sin mouse (MacBook trackpad — el hardware de María, user 1). CLO3D resuelve esto con remapeo de view controls; la industria web (Shapr3D, SketchUp Web, Figma) lo resuelve con **presets explícitos por esquema de input**. Fase 1 desbloqueó lo irrecuperable (pan 3D, presets de cámara); fase 2 construye el sistema de esquemas.

## Decisiones cerradas (Samuel, 2026-06-04)

1. **3D Trackpad: two-finger scroll = orbit** (estilo Blender/Shapr3D), pinch = zoom, ⌥+drag = pan.
2. **2D Trackpad: scroll = pan, pinch = zoom** (flip estilo Figma; preset Mouse conserva wheel = zoom).
3. **First-run: heurística pasiva + switch visible.** Default Mouse; primer pinch detectado → auto-switch a Trackpad + toast. La elección manual siempre gana.
4. **Picker: UnifiedBar settings (sección Input) + Command Palette.**

## Arquitectura (Enfoque A — slice + handlers propios)

```
src/store/inputSchemeSlice.ts      # Redux: { scheme, source }
src/input/wheelIntents.ts          # PURO: (evento, scheme, superficie) → intent
src/input/useSchemeHeuristic.ts    # hook one-shot de auto-detección (montado en App)
```

Alternativas descartadas: `@use-gesture` (dep nueva en las dos superficies más calientes; igual hay que manejar el doble-fire ctrl-wheel/pinch a mano) y boolean inline en localStorage (viola B6; sin `source` la heurística no sabe cuándo callarse).

### Slice

```ts
interface InputSchemeState {
  scheme: 'mouse' | 'trackpad';
  source: 'default' | 'auto' | 'user';
}
```

- `setUserScheme(scheme)` → `source: 'user'`. La heurística nunca más interviene.
- `autoDetectTrackpad()` → reducer aplica **solo si** `source === 'default'`.
- Ubicación per convención E-async-states: cross-feature persistente → Redux.

### Persistencia (B6: IDB canónico)

- `storageSet('settings', 'input-scheme', { version: 1, scheme, source })` — envelope zod opt-in, parse al hidratar en mount del App (patrón `avatarSlice` / saved-poses).
- Payload corrupto o IDB caída → default Mouse silencioso (variante silent de E-async-states para storage degradable). Sin crash, sin toast.
- Comment de shape inline obligatorio en el callsite (`// shape: InputSchemePersisted v1 — opt-in envelope: yes`).

### Capa de intents (el corazón testeable)

```ts
wheelIntent(
  e: { deltaX: number; deltaY: number; ctrlKey: boolean; metaKey: boolean },
  scheme: 'mouse' | 'trackpad',
  surface: '2d' | '3d',
): { kind: 'zoom' | 'pan' | 'orbit'; dx: number; dy: number } // deltas clampeados
```

Toda la matriz scheme × superficie × modificadores vive aquí, pura, con tests. Los componentes solo ejecutan el intent.

### Constraints de Halberg (no negociables, verificados en código 2026-06-04)

| # | Constraint | Cómo lo respeta el diseño |
|---|---|---|
| 1 | OrbitControls wheel-dolly no puede coexistir con gestos custom de wheel | `enableZoom={false}` **permanente** + UN solo wheel handler non-passive en el contenedor 3D que rutea por scheme. Zoom manual (dolly hacia target, clamp 0.6–5) y orbit (rotación esférica de `camera.position` + `controls.update()`) siguen el precedente del pan custom existente. |
| 2 | `patchMouseButtons` (Viewport3D ~191-204) revierte mutaciones runtime de `controls.mouseButtons` | El scheme layer **nunca** escribe `mouseButtons`. Cambiar preset solo cambia el routing del intent. |
| 3 | Space como modificador de pan es DOA (`sim.toggle` posee Space keydown con preventDefault) | Resuelto en fase 1: el modificador es ⌥ (Alt), verificado libre. |
| 4 | Wheel 2D dispara 2 acciones Redux por tick → tormenta bajo momentum | rAF-coalescing (ver Momentum). |
| 5 | Safari: GestureEvent y ctrl-wheel disparan ambos en pinch → doble-zoom | XOR estricto: `'ongesturestart' in window` → solo GestureEvent (`e.scale`); si no → solo ctrl-wheel. Nunca ambos. |

## Matriz de gestos (contenido de `wheelIntents.ts` + bindings existentes)

| Evento | Superficie | Mouse (CLO3D) | Trackpad |
|---|---|---|---|
| wheel plano | 3D | zoom (dolly) | **orbit** (deltaX→azimut, deltaY→polar, clamp polar anti-volteo) |
| ctrl/⌘+wheel (pinch) | 3D | zoom | zoom |
| right-drag | 3D | orbit (intacto) | orbit (two-finger-click-drag, sigue vivo) |
| middle / ⌥+drag | 3D | pan (fase 1, intacto) | pan (fase 1, intacto) |
| wheel plano | 2D | zoom anclado al cursor (intacto) | **pan** (deltaX y deltaY — pan horizontal real) |
| ctrl/⌘+wheel (pinch) | 2D | zoom anclado | zoom anclado |
| middle-drag / Hand tool | 2D | pan (intacto) | pan (intacto) |

Principios:

- **Nada se le quita a nadie.** El preset Trackpad solo agrega rutas. Right-drag y middle-drag viven en ambos presets.
- **Context menu 3D intacto** en ambos presets (right-click / two-finger tap + lógica 5px de `Viewport3D.tsx` ~317). Bajo Trackpad el orbit migra al scroll, así que el right-drag casi no se usa — pero no se rompe. (Cierra hallazgo #7 de Serrano.)
- **Zoom unificado:** `scale × 2^(-Δ·k)` con Δ clampeado a ±10 por evento y `k = 0.01` (constante inicial, ajustable en calibración manual). Trackpad emite deltas fraccionales (0.5–5px), mouse emite ±100–120 — el clamp + exponencial los hace simétricos. 2D conserva ancla al cursor y rango 0.1–10 existentes; 3D clampea a `minDistance`/`maxDistance` (0.6–5).
- **`main.tsx` queda intacto.** Verificado: el `preventDefault` a nivel documento (líneas 39-44) no hace `stopPropagation` — los listeners de canvas reciben wheel y gesture events igual. El bloqueo global sigue previniendo el page-zoom sobre chrome no-canvas (cierra hallazgo #5 de Serrano). Safari: los listeners de canvas leen `e.scale` de los GestureEvents que el bloqueo global ya preventDefault-ea; ambas cosas son compatibles.

## Momentum y rAF (pan 2D)

El scroll con inercia de macOS sigue emitiendo eventos tras soltar, sin evento terminador (no se puede detectar "fin de gesto"). Patrón:

1. Acumular deltas en un ref por evento.
2. Flush una vez por frame (rAF) aplicando transform directo al SVG.
3. Commit a Redux solo tras ~150 ms de silencio (idle timeout).

Es el patrón drag existente (`useEditorInteractions` ~541: DOM directo durante gesto, Redux al final). Mata la tormenta de dispatches medida por Halberg. El 3D no necesita rAF: muta cámara directo, cero Redux por evento. Cleanup del hook: cancel rAF + commit final pendiente.

## Heurística pasiva (one-shot)

- `useSchemeHeuristic` montado en App. Escucha `wheel` en window.
- Señal: `e.ctrlKey && !e.metaKey` (en Chrome/FF/Edge solo lo sintetiza un pinch de trackpad) con `source === 'default'`. En Safari la señal es `gesturestart`.
- Acción: `autoDetectTrackpad()` + `showInfoToast('Modo trackpad activado — cámbialo en Settings ▸ Input')`.
- El listener se desmonta tras disparar o si `source !== 'default'`.
- **Falso positivo conocido y aceptado:** usuario de mouse haciendo ctrl+wheel queda en Trackpad. Recuperable: el toast apunta al switch; el reducer garantiza que una elección manual nunca se pisa. (Lección tldraw PR #4612: auto-detect es hint, nunca autoridad.)

## UI

- **Picker:** sección **Input** en UnifiedBar settings mode. Segmented control: `Mouse (CLO3D)` / `Trackpad`, una línea de descripción de gestos por opción. Escribe `setUserScheme`.
- **Command Palette:** dos comandos — `Use trackpad controls` / `Use mouse controls`.
- **Hint del viewport** (línea de fase 1) scheme-aware:
  - Mouse: `right-drag orbit · middle/⌥-drag pan`
  - Trackpad: `two-finger orbit · pinch zoom · ⌥-drag pan`

## Testing (TDD, patrón fase 1)

- `wheelIntents.test.ts` — matriz completa scheme × superficie × modificadores; clamps; math exponencial.
- `inputSchemeSlice.test.ts` — `autoDetectTrackpad` solo con `source:'default'`; `setUserScheme` siempre gana; hidratación zod: payload corrupto → default Mouse.
- Orbit math — función esférica pura extraída: clamp polar, wrap de azimut.
- E2E smoke: dispatch de `WheelEvent` sobre el canvas 2D en preset trackpad → assert pan cambió (store read, patrón dress-avatar). Los E2E existentes no asertan semántica de wheel (verificado en fase 1) — no hay retarget.
- Manual en hardware real (MacBook): pinch ambas superficies, orbit por scroll, momentum 2D, Safari si hay acceso.

## Error handling

Todo degradable: IDB caída al hidratar → default Mouse silencioso; rAF pendiente al desmontar → cancel + commit final; GestureEvent ausente (no-Safari) → rama ctrl-wheel; evento wheel con deltas NaN/∞ → intent nulo (guard en `wheelIntent`).

## Apéndice — Hallazgos de Serrano (audit del borrador, 2026-06-04) y su resolución

| # | Hallazgo | Severidad | Resolución |
|---|---|---|---|
| 1 | Space-pan colisiona con `sim.toggle` global | BLOCKER | Fase 1: modificador es ⌥, Space no se toca |
| 2 | "Mouse (CLO3D) = current behavior" era premisa falsa — pan 3D no existía (`enablePan={false}`, MIDDLE/LEFT en -1) | BLOCKER | Fase 1 creó el pan (middle/⌥+drag custom); el preset Mouse ahora sí es snapshot fiel |
| 3 | Presets de cámara solo `Numpad*` — inalcanzables en MacBook; registry declaraba '2' y handler leía `Numpad2` | BLOCKER | Fase 1: top-row digits con guard de modificadores (Alt+dígitos es de fitmap.*) |
| 4 | `hand.tsx` prometía spacebar-hold nunca implementado | HIGH | Fase 1: descripción reescrita |
| 5 | Quitar bloqueo global sin reemplazo → page zoom sobre chrome | HIGH | `main.tsx` queda intacto (preventDefault no bloquea listeners de canvas — verificado) |
| 6 | Two-finger scroll diverge 2D (pan) vs 3D (orbit) sin declararlo | HIGH | Declarado intencional en la matriz; es la convención de la industria (Figma 2D / Blender 3D) |
| 7 | Context menu 3D huérfano bajo Trackpad | HIGH | Right-click/two-finger tap intacto en ambos presets |
| 8 | Persistencia sin schema/key/contrato | MEDIUM | `storageSet('settings','input-scheme',{version:1,…})` + zod envelope + shape comment |
| 9 | Heurística sin definición ni recovery | MEDIUM | Señal ctrlKey-wheel, one-shot, guard por `source`, toast con ruta al switch |
| 10 | Ubicación del picker sin decidir | MEDIUM | UnifiedBar settings ▸ Input + Command Palette |
| 11 | Flip 2D rompe muscle memory sin nota de migración | MEDIUM | Flip solo en preset Trackpad; Mouse conserva wheel=zoom anclado; ancla y rango 0.1–10 preservados en pinch |
| 12 | "Clamped exponential" sin constantes | LOW | Δ clamp ±10, `2^(-Δ·k)`, `k=0.01` inicial; rangos por superficie definidos |
