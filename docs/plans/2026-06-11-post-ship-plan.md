# Plan post-ship: del plan de paridad al release que enseña dónde duele

> Sucesor de `docs/plans/2026-06-11-clo3d-seam-sewing-parity-plan.md` (Fases 0-6 completadas el 2026-06-11, PRs #871-#876, 8 días antes del ship target).
> Consejo de priorización: Lyra Sage (asignación/coste de oportunidad) + Cassian Stride (triage shippable), 2026-06-11, sobre inventario verificado de 5 fuentes (plan § 5/6, PRs #871-876, marcadores en código, issues de GitHub, estado de release).

## 0. Veredicto en una frase

**El post-plan no empieza por la épica boundary: empieza por el acto material de release que el § 5:90 prometió y nunca ocurrió, sigue con los replay-specs que congelan lo recién mergeado, y solo entonces — con red de regresión y una semana de uso real — arranca E1 en rebanadas.**

## 1. Estado de partida

### Lo que el plan de paridad cerró
Núcleo shippable de Cassian entregado completo: 2 piezas con curvas se cosen con 2 clicks, el seam cierra ≤2s en WASM (de verdad — Fase 5 arregló el worker que crasheaba y caía a CPU en silencio), color de par estable, tick de inicio + X cruzada + Ctrl+B real, SA per-edge honesto que sobrevive el load, aviso explícito en 0-constraints.

### Lo que el inventario descubrió (2026-06-11)
- **El "ship 19-jun" no tiene acto material**: CHANGELOG congelado en 0.10.0 (2026-03-29), `package.json` en 0.7.0 (desincronizados), **cero git tags**, y `deploy.yml` auto-deploya cada push a main a prod (EC2) sin gate. No hay frontera identificable entre "antes" y "después" del ship.
- **Nada del post-plan tiene issue de tracking**: ni las 2 épicas, ni M:N, ni seam lines 3D, ni live edit, ni el batch de known-issues. Los 2 issues que existen son peligrosos o stale: **#486 (partial-edge) no codifica la restricción de pareja atómica** — implementarlo tal como está escrito arma el bug del solver que el plan documentó; #555 (GPU seams) quedó obsoleto tras Fase 4.
- El MVP doc tiene decision gate **jue-vie 18/19-jun (M5)**.
- Estrategia declarada (memoria): repo privado se queda; repo público limpio nuevo para el release.

## 2. El consejo en dos líneas

- **Lyra**: la máquina de release es la mayor asimetría del tablero (2-4 días → desbloquea toda la estrategia declarada); E1 es lo único que compone (3 features + sustrato del agente); partial-edge/M:N ahora = asimetría invertida (deuda nueva). Asignación: sem 1 → 60% release / 25% fast-follow / 15% RFC E1; sem 2-4 → 70% E1 / 20% E2 sembrado / 10% triage público.
- **Cassian**: cero features son HARD esta semana — el único bloqueo del 19-jun es administrativo. Specs antes que refactor ("el orden inverso es un salto de fe"). E1 no arranca hasta que el release respire una semana.

## 3. Fases de ejecución (cada una = 1 PR desde `origin/main`)

| # | PR | Contenido | Done verificable | Est. | Fecha |
|---|---|---|---|---|---|
| **R0** | `chore(release): v0.11.0` | `package.json` 0.7.0→0.11.0; entry CHANGELOG 0.11.0 con #871-876 + sección **Known Issues** = tabla § 5 del plan de paridad verbatim; waiver de una línea para el hueco 0.10.x ("interim: ver git history" — backfillear marzo-junio es arqueología, no release); tag anotado `v0.11.0` sobre el merge (**push del tag solo con aprobación explícita del usuario**). Mismo bloque, fuera del PR: editar #486 (pareja atómica obligatoria), cerrar #555 como blocked-external (→ #708/#731), abrir issues E1/E2/SeamRenderer3D-fast-follow, re-scope #681 contra lo que Fase 4 ya shippeó | `git tag` muestra v0.11.0; versiones coinciden; 4-5 issues editados/creados | 3-4h | **jue 12-jun** |
| **R1** | `test(e2e): seam parity replay specs lote 1` | 8-10 specs del benchmark contra lo recién shippeado: 2-click segment sewing, cierre ≤2s en WASM, X de cosido cruzado + Ctrl+B la deshace, toast de 0-constraints, color de par estable bajo selección, SA per-edge sobrevive reload. Base: `seam-curved-edges` / `seam-fixes` / `sewing-tools` existentes. **E2 no como backlog de QA sino como red de seguridad del refactor E1** | Specs verdes en CI sharded; el guion del demo del gate se deriva de los specs | 6-8h | **vie 13 – lun 15-jun** |
| **R2** | `feat(render): SeamRenderer3D sobre garment simulado` | El fast-follow nombrado del § 5:87: quitar el gate `!useClothSim`, alimentar posiciones simuladas. **Time-box duro: si el mar 16 EOD pelea con el renderer, se aborta** — es polish del demo, no core. Add-on opcional si cabe limpio: hover length-difference en segment sewing (2h, benchmark paso 3) | Seam lines visibles sobre prenda simulada; screenshot diff | 4-6h | **mar 16 – mié 17-jun** |
| **GATE** | — | MVP decision (M5) con insumos completos: tag, known-issues publicados, demo guionado por specs. Si GO público → R3 (repo limpio nuevo, ~1-2 días, semana del 22); si no → directo a R4 | Decisión registrada | — | **jue 18 / vie 19-jun** |
| **R4** | E1 boundary entity en rebanadas (post-gate) | E1.0 RFC + tipo boundary + parametrización arc-length sin consumidores → E1.1 adapters de los 4 direccionamientos, consumidores read-only → E1.2 migrar dispatch + picker → E1.3 migrar cornerTypes/SA/notch y matar legacy. Cada rebanada verde contra los specs de R1. Lotes 2-4 de E2 intercalados, spec-first por rebanada. **Condición de entrada: specs R1 mergeados + ≥1 semana de uso real del release** | Por rebanada: specs R1 verdes + gates CI | 3-4 sem | **arranque semana 22-jun** |
| **R5** | Features desbloqueadas | Partial-edge pareja atómica (#486 re-scopeado) → M:N subdivisión proporcional → live seam edit sin teardown. En ese orden: cada una consume el sustrato t-range/intervalos que E1 crea | Por feature: spec replay del benchmark correspondiente | — | post-E1 |

**Total semana 1: 13-18h en 5 días laborables** — holgura real para un dev solo, gate cubierto aunque R2 se aborte.

## 4. Parked / no entran en este plan

| Item | Decisión | Nota |
|---|---|---|
| GPU seam parity + Neural seams | **PARKED** (bloqueo externo) | Three.js 0.183 atomicAdd (#708/#731). No accionable = no entra en planes con fecha. Tier gated honestamente por Fase 4 |
| Deploy a prod sin gate | SOFT → **waiver en R0** | El tag hace el release identificable sin tocar el pipeline; la decisión repo-público del gate puede invalidar cualquier gate que se construya antes |
| Batch polish (corners curvos, tipografía, memoización Clipper2) | POST, gap-filler | Un PR batch cuando se libere un día; listado como known-issue en R0 |
| Backlog pre-existente (#676-680, #683-689, memoryTools clear UI) | POST, **carril separado post-E1** | No intercalar con E1: el context-switch es el asesino del dev solo. Excepción: re-scope de #681 entra en R0 (es edición de issue) |
| memoryTools dark surface | Decidir **antes** del repo público | En privado aceptable; en público, un agente que escribe LS sin UI de borrado es una pregunta que alguien hará |
| Repo público limpio (R3) | **Condicional al gate** | Es la pregunta del 18/19, no la respuesta |

## 5. Riesgos y guardarraíles

- **#486 es un arma cargada hasta que se edite** (R0): tal como está escrito invita a implementar la UI de t-ranges sin renormalización — el bug exacto que la Fase 5 mitigó.
- **Orden no negociable: specs (R1) antes que E1.** La épica de "semanas" solo es mergeable en rebanadas si hay red de regresión que defina "no rompí nada".
- **E1 no arranca sin uso real** — el argumento del propio plan de paridad (§ 5:83, "el mejor argumento para hacerlo bien es un release que enseñe dónde duele") tomado en serio, no como decoración.
- **La autorización durable de merge del plan de paridad está AGOTADA** — esta serie requiere aprobación por PR o una autorización nueva explícita.
- **Acciones outward-facing de R0** (push de tag, cambios de deploy, repo público) requieren confirmación explícita del usuario en cada caso.

## 6. La pregunta incómoda (Lyra, sin editar)

> El deploy lleva meses empujando cada commit a prod y nadie lo notó; cero tags, changelog muerto desde marzo. Eso solo es posible si prod no tiene usuarios. **¿Quién, con nombre, va a abrir OpenClo la semana del release — y si no puedes nombrar a tres personas, para quién es el release?**

## 7. Permission slip (Cassian)

> Autorizo R0 mañana jueves 12-jun: declarar v0.11.0 con lo que ya está en main, known-issues del § 5 publicados tal cual, hueco del CHANGELOG waiveado en una línea, deploy-gate diferido — aceptando que el release es honesto sobre lo que no hace en vez de tarde sobre lo que sí.

Rechazar el slip exige decir qué entra en su lugar y qué fase sale. El default no puede ser "más polish" ni "empezamos E1 ya que tenemos 8 días".
