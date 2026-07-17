# Matched corner ("Empatada") — diseño

**Fecha:** 2026-07-17 · **Origen:** nota 164 de María (margen de costura estilo Gerber) · **Estado previo:** `CornerType 'match'` existe en el modelo y la UI (`VertexPropertiesSection`, chip deshabilitado "próximamente") pero `cornerMatch` es un stub que delega a `cornerMitered`. El hueco `_seamLookup` en `generateSeamAllowanceWithCorners` está declarado y sin usar.

## Semántica (definida por María, confirmada por Gerber)

> María (2026-07-17): "la costura que se crea debe ir emparejada en cuanto a longitud, por tanto lo que se necesita es modificar la línea exterior de la costura para que coincida con la que se copia, pero no se copian ángulos: el ángulo de la nueva costura será el necesario para conseguir el largo que se quiere copiar." El largo se toma "del margen de la otra pieza con la que se cose ese lado."

> Gerber AccuMark, [Function_Corners](https://help.gerbertechnology.com/AccuMark/PDS/Function_Corners.htm): "Match Seam — Use to create corners that have matching shapes between two pieces" (se seleccionan puntos de referencia en ambas piezas y la línea común de costura).

**En una frase:** en un vértice con esquina `match`, la **línea de corte** (exterior) del borde cosido de esta pieza se ajusta para que su **largo iguale** el largo de la línea de corte del borde vecino (la pieza con la que se cose, vía `Seam`). Se copia el largo, no el ángulo: el cierre de la esquina toma el ángulo que resulte.

## Algoritmo

1. **Resolver (`src/utils/seam/matchResolver.ts`, nuevo):** `buildMatchLookup(piece, allPieces, seams)` →
   para cada vértice con `cornerTypes[v] === 'match'`:
   - Identificar cuál de los dos bordes adyacentes al vértice participa en un `Seam` (vía `piece.edges` / `SemanticEdge` → `Seam.pieceA/pieceB` por `edgeName`). Si ambos, preferir el borde cuyo seam existe; si ambos cosidos, el de menor índice de comando (determinista, documentado).
   - Localizar el borde del partner (`pieceId` + `edgeName` opuestos del seam).
   - Calcular el **largo de la línea de corte del partner en ese borde**: generar el SA del partner con `generateSeamAllowanceWithCorners` **degradando todo `match` del partner a `mitered`** (resolución a un nivel — mata la recursión; si ambas piezas usan `match` entre sí, cada una resuelve contra el largo mitered-resuelto de la otra: simétrico, estable, determinista) y medir el tramo de línea de corte correspondiente al rango de comandos del borde (útil: `commandRangeToFlattened`).
   - Devolver `{ vertexIndex → { side: 'prev'|'next', targetLen } }`.
2. **Generador:** `generateSeamAllowanceWithCorners` calcula el largo base de la línea de corte del borde cosido con la esquina resuelta como `mitered`; `delta = targetLen − baseLen`.
3. **Geometría del empate (en el generador, no en el dispatch genérico — la función de esquina solo ve los últimos segmentos y `match` necesita el polyline completo del borde):** deslizar el endpoint de la línea de corte en el lado del vértice:
   - `delta > 0`: extender colinealmente el último segmento del offset del borde cosido.
   - `delta < 0`: retroceder caminando el polyline acumulando largo (soporta curvas).
   - **Clamp defensivo:** nunca retraer más allá del 90 % del borde (dejar ≥10 % del largo base); si el clamp actúa, el resultado es el clamped (no throw).
   - **Cierre:** segmento recto desde el endpoint deslizado hasta el endpoint del offset del borde adyacente (el "ángulo necesario" de María).
4. **Fallback → `mitered`** cuando: el vértice `match` no tiene ningún borde adyacente cosido, el partner no existe/está degenerado, o los largos no son medibles.

## Cableado

- **Render 2D:** `PieceRenderer` construye el lookup (seams vía selector Redux) y lo pasa. Memoizar por (outline, edges, cornerTypes, seams, anchos) — no recalcular el SA del partner por frame.
- **Export:** `preparePieces`/`pipeline.ts` recibe `seams` (nuevo parámetro opcional; los callers que no lo pasen conservan el comportamiento actual = fallback mitered).
- **UI:** habilitar el chip "Empatada" en `VertexPropertiesSection` (quitar `disabled` y el "(próximamente)").

## Tests (TDD estricto)

- Resolver: vértice→borde cosido→partner→targetLen; ambos-adyacentes-cosidos determinista; sin seam → null.
- Geometría: delta>0 extiende colineal; delta<0 retrocede cruzando puntos del polyline; clamp al 90 %; cierre recto al offset adyacente; `prevWidth ≠ nextWidth`.
- Anti-recursión: dos piezas con `match` mutuo → largos estables e independientes del orden de evaluación.
- Fallback: sin seam / partner ausente → idéntico a mitered.
- Wiring: render con seams produce path distinto de mitered cuando hay delta; export AAMA emite la línea de corte empatada; sin `seams` el export no cambia.
- UI: chip habilitado y despachable.

## Fuera de alcance

- "Match Squared" de Gerber (variante 90°) — solo si María lo pide.
- Re-empate reactivo al editar la pieza vecina en vivo (el SA es derivado: se regenera al re-render, suficiente).
