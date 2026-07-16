# Decisión M2 — Registro único de capacidades y rol por superficie

**Estado:** decidido 2026-07-16 · **Aterriza:** con la épica de grading-UI (M2), como precondición
**Origen:** dictamen de Richter en la revisión E2E del frontend (`docs/plans/2026-07-16-frontend-minimalismo-revision-e2e-plan.md`)

## El problema en una frase

Hoy cada superficie del shell (menú, palette, docks, paneles, overlays) **origina** sus
capacidades en vez de **proyectarlas** desde un registro común — por eso pudo existir un
comando en la palette cuyo panel no existía en el host (el placeholder circular de Fase 1),
y por eso cada feature nueva debe cablearse a mano en N lugares o deriva en callejón muerto.

## La decisión (4 principios)

1. **Registro formal de capacidades.** Un módulo único declara cada capacidad con su
   categoría de primera clase — `verbo` (ejecuta algo), `panel` (abre inspección),
   `modo` (cambia el cursor/vista), `ajuste` (configura). La palette, el LogoMenu y los
   shortcuts se **derivan** de él; una entrada sin implementación es un error de tipos,
   no un descubrimiento del usuario. *(La Fase 3 ya dio el primer paso: `CommandDef.category`
   con set cerrado en `unifiedBarCommandDefs.ts` — el registro crece desde ahí, no desde cero.)*
2. **Paneles como unión cerrada.** `renderPanelContent` deja de indexar por string libre:
   el nombre de panel es un union type; añadir un panel obliga (compilador) a darle
   contenido, lado (`getPanelSide`) y label visible (`PANEL_LABELS`) a la vez.
3. **Autoridad única de composición del viewport.** Los overlays del 3D declaran su capa
   (`efímero` | `herramienta` | `debug`) y su carril; nadie se posiciona ad-hoc.
   Todo lo `debug` se gatea a `import.meta.env.DEV` (patrón SolverMetrics). Los carriles
   fijados en Fase 1 (S3) son la versión manual de esto.
4. **Rol declarado por superficie**, contra el cual se evalúa toda feature nueva:
   - **LogoMenu** = catálogo exhaustivo y navegable (todo lo que existe está aquí).
   - **Palette (Ctrl+K)** = proyección buscable del mismo registro.
   - **Docks** = proyección espacial de MODOS de alta frecuencia (herramientas), nunca de acciones sueltas.
   - **Paneles (ContextPanel)** = inspección de sustantivos (pieza, costura, tela, avatar...).
   - **Overlays del viewport** = estado efímero de la simulación/vista; jamás navegación.
   - **UnifiedBar** = un input, tres proyecciones (chat = agente, comandos = registro, ajustes = preferencias).

## Por qué importa (más allá de la limpieza)

- El copiloto necesita el **mismo** registro que el humano para operar la UI; sin él, las
  affordances del agente y las del usuario divergen (dos cerebros desincronizados).
- El moat (grading, ficha técnica, marcada) aterriza en este shell: con registro, cada
  feature nueva se declara una vez y aparece en menú+palette+shortcut coherentemente.

## Qué NO es

No es un rediseño ni un framework: es formalizar en tipos lo que Fase 1–3 dejó como
convención (placeholder muerto eliminado, `PANEL_LABELS`, `category`, carriles). Migración
incremental — el registro nace envolviendo `COMMANDS` y los 7 paneles existentes.

## Disparador

Ninguna épica que añada superficie de UI (la primera: grading-UI) arranca sin aterrizar
antes los principios 1 y 2. Los principios 3 y 4 se aplican pieza a pieza al tocar cada área.
