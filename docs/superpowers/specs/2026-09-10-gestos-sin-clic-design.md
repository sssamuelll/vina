# Gestos sin clic — Editar patrón habla antes de tocarlo, y la pieza abierta avisa donde está

Revisión asistida del 2026-09-10 (Samuel + Claude, sobre el PR #1149 ya
mergeado). Dos notas de QA, registradas primero como comentarios en el PR
(`issuecomment-5615735370`, `issuecomment-5615916096`) y convertidas aquí en
contrato de diseño antes de delegar la implementación.

## § 1 — Editar patrón: el hover no espera un clic

### La cita

> "quiero que las piezas me hablen [...] sin tener que tener seleccionada una
> pieza quiero que no tenga que hacer clicks nunca para que los eventos
> funcionen, los eventos tienen que funcionar siempre porque el canvas es
> altamente accionable."

### Lo que hay hoy

`useEditPattern.handleMouseMove` (línea ~499) sale de inmediato si
`!state.isEditing || !state.editingPieceId`. Y `state.isEditing` solo se
vuelve `true` cuando `enterEdit(pieceId)` corre — y eso solo pasa con un clic
sobre la pieza (`useEditorInteractions.ts:763-782`). Resultado medido: con
`Q` activo, antes del primer clic, pasar el mouse sobre cualquier tramo no
enseña ningún resalte. Es el mismo gesto de "entrar en aislamiento" de
Illustrator, pero SIN la señal previa que Illustrator sí da (el cursor y el
resalte cambian con solo pasar el mouse).

### Decisión

Separar HOVER de ENTRAR. El resalte de tramo (`data-tramo-hover`, el mismo
atributo que ya pinta `EditPatternOverlay.tsx`) tiene que aparecer con solo
pasar el mouse sobre cualquier pieza NO bloqueada mientras `Q` está activo —
con o sin pieza seleccionada, con o sin haber clicado antes. Entrar de verdad
(nodos visibles, arrastre, menú contextual) sigue pidiendo el primer clic:
eso no es la señal que faltaba, es la acción en sí.

**Alcance de esta tanda: solo Editar patrón** (`useEditPattern.ts` +
`EditPatternOverlay.tsx`). Editar curva (`useEditCurve`, activado desde
"Convertir en curva por puntos") tiene la misma forma de brecha
(`useEditorInteractions.ts:784-797`) y queda fuera — si se decide cerrarla,
es su propia tanda, no una extensión silenciosa de esta.

### Contrato técnico

- Nuevo campo `hoveredPieceId: string | null` en `EditPatternState`
  (`useEditPattern.ts`), junto a `hoveredSegment`/`hoveredNode`.
- En `handleMouseMove`, cuando `!state.isEditing`: recorrer `pieces` (las NO
  `locked` — una pieza bloqueada no es accionable, no tiene por qué hablar),
  convertir el cursor a coordenadas locales de cada una (`toLocal`, ya
  existe) y usar `nearestSegment` para encontrar el tramo bajo el cursor. El
  primer golpe dentro de `hitRadius` fija `hoveredPieceId` + `hoveredSegment`;
  si no hay ninguno, se limpian los dos. No hace falta iterar nodos (los
  manejadores/anclas siguen siendo del modo "entrado").
- Cuando `state.isEditing` es `true`, el comportamiento de hoy no cambia
  (el hover sigue calculándose solo contra `editingPieceId`) — esta tanda no
  toca el caso "ya estoy editando y paso el mouse sobre otra pieza".
- `EditPatternOverlay`: hoy hace
  `const piece = pieces.find(p => p.id === editingPieceId); if (!piece) return null;`
  — bloquea TODO si no hay sesión entrada. El resalte de tramo (el bloque que
  ya construye `data-tramo-hover`, líneas ~38-100) tiene que dibujarse para
  `editingPieceId ?? hoveredPieceId`. Los círculos de ancla
  (`classifiedAnchors`/`nodes`) siguen exigiendo `editingPieceId` — no hay
  `nodes` calculados para una pieza que solo se está sobrevolando.
- Al clicar y entrar de verdad, `hoveredPieceId` deja de importar (el clic ya
  puso `editingPieceId`); no hace falta limpiarlo explícitamente pero no debe
  quedar pisando la lectura si alguien lo mira después.

## § 2 — La pieza abierta avisa junto a ella, no en una esquina

### La cita

> Sobre el toast de "no se puede simular": "me gustaría igual que saliera ahí
> mismo cerquita de la línea" — misma idea que § 1: el feedback vive junto al
> objeto que lo provoca.

### Lo que hay hoy

`PatternEditor.tsx:196-199` dispara un toast (`showWarningToast`) UNA VEZ, al
completar el trazo, si el `outline` no cierra en `Z`. Funciona (se verificó
en vivo dos veces esta semana), pero es fácil de perder — aparece, se va, y
no señala DÓNDE está el problema si hay varias piezas en el lienzo.

### Decisión

Quitar el toast. En su lugar, toda pieza cuyo `outline` no termine en `Z`
dibuja su propio aviso — el mismo patrón que ya existe para
`piece.locked` (`PieceRenderer.tsx:501-518`: un `<text>` sobre el papel, en
el centro del contorno, `pointerEvents: none`, sin depender de que la
usuaria esté mirando en el momento exacto). Es más robusto que el toast
porque es una propiedad derivada del propio `outline` — se aplica a
CUALQUIER pieza abierta en cualquier momento, no solo a la recién creada.

No conviven las dos señales a la vez (toast Y marca en la pieza) — la nota de
ayer sobre "dos cuadros para una misma información" (causa C) es exactamente
el error a no repetir.

### Contrato técnico

- Quitar `dispatch(showWarningToast('La pieza quedó abierta y así no se
  puede simular.'))` de `handlePieceComplete` (`PatternEditor.tsx:196-199`).
  El `if (!piece.outline.some(...))` que lo envolvía puede irse con él — ya
  no hay nada que hacer ahí.
- En `PieceRenderer.tsx`, junto al bloque `{piece.locked && (...)}` (línea
  ~501), un bloque paralelo:
  `{!piece.outline.some(c => c.type === 'Z') && (...)}` que dibuja un
  `<text>` con el mismo estilo (`fontFamily: var(--font-mono-2d)`,
  `fontSize: 10 / zoom2D`, `textAnchor: middle`, `pointerEvents: none`),
  usando el token `--piece-error-2d` (NO `--piece-locked-2d` — ese es
  semánticamente "candado"; `--piece-error-2d` ya está descrito en
  `tokens.css` como "unresolved / invalid geometry", que es exactamente
  esto). Texto: `abierta: no se puede simular` (minúsculas, mismo registro
  que "bloqueada").
- Posición: mismo centro que "bloqueada"
  (`getOutlineCenter(piece.outline)`), pero con `cy + 28 / zoom2D` en vez de
  `+14` — si algún día una pieza está bloqueada Y abierta a la vez, los dos
  avisos no se pisan.

## Fuera de alcance (a propósito)

- Extender el hover-sin-clic a Editar curva, a Seleccionar, o a cualquier
  otra herramienta.
- Cualquier cambio al gesto de ENTRAR (el clic que hace `enterEdit`) — sigue
  siendo un clic.
- Un ícono en vez de texto para el aviso de pieza abierta — el precedente
  (`bloqueada`) es texto, y no hay pedido de cambiarlo a ícono.
