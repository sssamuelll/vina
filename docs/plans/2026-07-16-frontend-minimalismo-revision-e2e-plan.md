# Revisión E2E del frontend + plan de minimalismo — consenso del roster

**Fecha:** 2026-07-16 · **Método:** recorrido E2E real con Playwright (import `maria_patrones_samuel_2M.dxf` → auto-sew → 3D → drape WebGPU 29.3k partículas → 9 paneles → laptop 1366×768; 20 screenshots) + detector automático (`npx impeccable`) + 5 assessments independientes del roster (Iris Tane visual, scorer Nielsen aislado, Vex Rune bloat verificado en código, Elias Richter IA estructural, Cassian Stride triage).

**Evidencia:** `.tmp/ui-review-2026-07-16/` (screenshots, outputs completos del roster, notas del recorrido). Guion reproducible: `.tmp/e2e-walkthrough.mjs`.

---

## Diagnóstico consensuado (los 5 convergen)

**El instrumento minimalista ya existe** — empty state "Trae tu patrón", `tokens.css` disciplinado (papel/chrome, acento reservado), docks contenidos (28 botones first-run / 34 en split: normal para un CAD). **Lo que falla es una tercera capa flotante sin gobierno** (HUD de debug, overlays que se ocluyen, labels que colisionan, paneles muertos) **más dos fugas estructurales**: el design system no está renderizando (override legacy) y ~6,300 líneas de UI muerta acumulando deriva.

En palabras de Iris: *"El descontrol vive en los overlays, no en el sistema. Falta aduana."* En las de Richter: *"Los 5 sistemas de navegación son un solo problema: la ausencia de registro."*

**Score Nielsen: 19/40** (por debajo del rango 20–32 típico). Carga cognitiva: 6/8 flags → CRITICAL. Veredicto AI-slop: **no es slop** — identidad real en el shell (7/10), que muere al abrir cualquier panel (3/10).

| Heurística Nielsen | Score | Ancla |
|---|---|---|
| Visibilidad de estado | 2 | "SIMULATING · 0fps" lee como crash; "none · 5p" indescifrable |
| Sistema/mundo real | 2 | "765 seam constraints", "face-poke unavailable on this tier" a una patronista |
| Control y libertad | 2 | Auto-sew pide "revisar y confirmar" sin ofrecer ningún camino para hacerlo |
| Consistencia | 1 | ES/EN mezclado; paneles reales vs letreros muertos; ⌘K en Windows |
| Prevención de errores | 2 | "Delete Piece" sin estilo destructivo en medio del form; grading "European Women" + avatar masculino + 0 tallas |
| Reconocimiento vs recuerdo | 2 | Simulation/Colorways SOLO existen vía palette |
| Flexibilidad/eficiencia | 3 | Palette buena; LogoMenu sin un solo accelerator visible |
| Estética/minimalismo | 3 | Shell elegante; HUD + overlays solapados lo rompen |
| Recuperación de errores | 1 | Labels de mismatch encimados = ilegibles (el diagnóstico core del auto-sew) |
| Ayuda | 1 | Los letreros "available via ⌘K" son la anti-ayuda |

## Hallazgos clave (verificados)

1. **`App.css:24-28` PISA el design system.** Importa tokens (vía `base.css`) y después redefine `--accent: #4a9eff` (azul VS-Code legacy), `--accent-hover`, `--text-secondary`. El indigo `#6366f1` de `tokens.css:16` **nunca ha renderizado**. Encontrado independientemente por Vex y Cassian; verificado a mano.
2. **HUD de debug en producción.** `SimulationStatusOverlay` montado incondicional (`Viewport3D.tsx:808`): 5 líneas monospace EN con FPS en rojo y jerga de motor, en la posición primaria de lectura; en 1366×768 **ocluye los controles top-right**. (No confundir con `SolverMetrics`, que sí es dev-only.)
3. **Labels de mismatch se autodestruyen.** Tras auto-sew, "220.7mm/203.6mm/219.6mm mismatch" impresos uno sobre otro (shots 04/08). El diagnóstico central del paso costura es texto basura.
4. **4 comandos ⌘K mienten (circular):** `show-problems`/`show-simulation`/`show-colorways`/`export-techpack` (`unifiedBarCommandDefs.ts:48,52,53,56`) abren el placeholder "X — available via ⌘K" (`AppShell.tsx:58-63`). Ídem ~15 items noop/dead-end del LogoMenu (Pattern menu completo, Export 3D, Duplicate/Delete con shortcut pintado).
5. **Colisiones de layout flotante:** pill "Textured" solapado sobre el toolbar 3D; "SIMULATING · fps" recortado detrás del UnifiedBar; "+" flotante sin label; z-index bleed de piezas 2D sobre el panel de comandos (shot 19).
6. **Split-brain de idioma:** ES en empty state/toasts, EN en palette, paneles, menús y warnings. María es la usuaria de referencia.
7. **Cut list de Vex (verificado, cero importadores):** `Timeline/` (~1.3k líneas), `SkillMarketplace/` (~1.3k), `ExportSkillModal/` (~644), `MarkerEditor/` (~596), `ImportDXFDialog/` (~502, duplicado del drop-zone), `PluginManager/` (~492), `CommandPalette/` (~303, reemplazado por UnifiedBar), `StatusBar/` (~216), `ShortcutHelp/` (~179, ni el menú lo abre), `styles/shared.css` (261, cero consumidores), ~45 variables CSS legacy, bloques `!hideChrome` inalcanzables en Viewport3D. **≈ −5,800 líneas CERTAIN.**
8. Menores: 'Inter' hardcodeada en ~35 sitios (vs `var(--font-sans)`), `transition: width` ×2, truncamientos (Name, "WAIST (C…", fabric tiles), BOM "(stale)"/$0.00, gizmo plantado en el cuello del avatar post-import, panel-en-panel Avatar (2 headers, 2 X), 6 warnings de selectores Redux sin memoizar.

## Plan

### Fase 1 — Viernes 17-jul (pre-kill-switch, ~9-11h, orden de Cassian)

> Core shippable: *el shell actual con la capa flotante domada — sin rediseño, sin i18n, sin registry.*

1. **S1** Borrar el override de `App.css:24-28` + smoke visual (0.5h). Primero: revela el look real. ⚠️ cambio visual global → Samuel lo mira con la app abierta.
2. **H2** Colapsar `SimulationStatusOverlay` a una línea (punto de color + tier), expandible al click; conservar dentro el warning real de seams-a-0-constraints (2h).
3. **H1** Anticolisión de labels de mismatch: offset alternado con leader lines, o agregación "N mismatches" clickeable (2-3h).
4. **S3+S4** Colisiones top-right/bottom + no mostrar fps hasta el primer frame real (1.5-2h).
5. **S2** Borrar los 4 comandos ⌘K mentirosos + items noop del LogoMenu (1-2h). Borrar, no construir.
6. **S5+S6** Deseleccionar pieza post-import (gizmo) + un solo header en panel Avatar (1.5h).
7. Gate completo (`npx tsc -b --noEmit && npm run test && npm run lint`) + recorrido manual del flujo María en 1366×768 + deploy `openclo.sdar.dev`.

Si aprieta el reloj: se cortan 6, luego 5. Nunca 1-4.

### Fase 2 — Semana del 20-jul (higiene, cero cambio visible)

- Ejecutar la cut list CERTAIN de Vex (≈ −5,800 líneas, −33 archivos). Precondiciones: destino de `markerSlice.test.ts`; decidir si el export 3D/turntable (única ruta: RenderSettingsPanel, hoy inabrible) se recablea o muere; `animationSlice`/`markerSlice` en cascada.
- Pasada mecánica 'Inter' → `var(--font-sans)` (en SVG del canvas 2D: `--font-ui-2d`); `transition: width` → transform/grid.
- Truncamientos + tooltips; ⌘K→Ctrl+K por plataforma; accelerators en LogoMenu; aria-label del botón icon-only; BOM sin "(stale)"/$0.00; memoizar los 6 selectores con warning.

### Fase 3 — Post-piloto (producto)

- **i18n español completo** (el hallazgo #1 de María; a medias es peor que consistente en inglés — pase completo: palette → Properties → warnings primero).
- Grading defaults coherentes con el avatar cargado (antes de la primera demo de grading, no antes del viernes).
- Properties: separar propiedades de patronaje vs parámetros de simulación; progressive disclosure.
- Palette agrupada por categoría (hoy 15 comandos planos mezclando verbos/lugares/settings).

### Fase M2 — Estructural (dirección Richter, escribir ANTES de la épica grading-UI)

Una página de decisión con: **registro único de comandos** (categorías de primera clase: verbo/panel/modo/setting) del cual palette, menú y shortcuts se *derivan*; **paneles como enum cerrado** (una entrada muerta = error de tipos, no descubrimiento del usuario); **autoridad única de composición del viewport** (capas declaradas: efímero/herramientas/debug, debug gateado fuera de prod); **rol declarado por superficie**. Sin esto, el sexto sistema de navegación nace con grading.

## Decisiones pendientes de Samuel

1. **Permission slip de Cassian:** shipear el viernes con items 1-7 aceptando explícitamente: chrome en inglés, grading defaults sin tocar, código muerto intacto, registry diferido a M2.
2. **Verificación visual del acento** (S1): indigo `#6366f1` reemplaza al azul `#4a9eff` en toda la app.
3. `.agents/context/PRODUCT.md` creado como draft (gate del skill impeccable) — revisar/ajustar.
