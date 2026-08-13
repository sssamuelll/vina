# Unidad de selección del margen en el patrón de María

**Fecha:** 2026-08-13 · **Issue:** #1027 (M-220) · **Task 1** de la tanda 2c  
**Fuente:** `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`  
**Test permanente:** `src/utils/__tests__/unidadMargenMaria.test.ts`

## Qué se midió

El importador entrega `piece.edges` sin rellenar. La aplicación llama a
`detectSemanticEdges` al cargar el proyecto, así que el test hace lo mismo
antes de preguntar a `resolveSeamAllowanceClick`. Medir la pieza recién
importada habría cerrado artificialmente la rama de borde.

Se repartieron 200 clics a distancia de arco uniforme por cada contorno. Cada
clic cae en el centro de su intervalo para no fabricar coincidencias exactas
con esquinas. Los radios reproducen la vista del patrón completo usada para
calibrar el arreglo de #1048: zoom 0,53 px/mm, 10 px para vértice y 12 px para
borde.

## Resultado

| Pieza | comandos | bordes semánticos | borde | esquina | cuerpo/vacío | comandos por borde alcanzado |
|---|---:|---:|---:|---:|---:|---|
| PATRONES PARA SAMUEL-1 | 202 | 4 | 174 (87 %) | 26 | 0 | 1, 67, 127 |
| PATRONES PARA SAMUEL-2 | 18 | 5 | 168 (84 %) | 32 | 0 | 1, 3 |
| PATRONES PARA SAMUEL-3 | 194 | 9 | 172 (86 %) | 28 | 0 | 1, 58, 61 |
| PATRONES PARA SAMUEL-4 | 202 | 4 | 174 (87 %) | 26 | 0 | 1, 67, 127 |
| PATRONES PARA SAMUEL-5 | 276 | 9 | 172 (86 %) | 28 | 0 | 1, 77, 105 |
| **Total** | **892** | **31** | **860 (86 %)** | **140** | **0** | **hasta 127** |

Los 140 resultados de vértice son esquinas detectadas por
`detectCornerCommands`, no las muestras intermedias de las polilíneas densas
que producían el 98 % de falsos vértices antes de #1048. La precedencia
vértice→borde es intencional y se conserva.

## Veredicto sobre las dos partes vivas de #220

1. **«Todo o nada» queda confirmado.** Cuando gana un borde, la unidad es un
   `SemanticEdge` completo identificado por `edgeId`. El objetivo no contiene
   comienzo ni final de tramo. Hay bordes alcanzados que agrupan 58, 67, 77,
   105 y 127 comandos; no son comandos sueltos disfrazados.
2. **«Una parte random» no se reproduce en este corte.** Ninguno de los 1.000
   clics cayó al cuerpo ni al vacío, y los rangos grandes permanecieron
   enteros. Los rangos de un comando que aparecen en la tabla son lados rectos
   cortos legítimos; un borde recto puede ser un solo comando sin ser un fallo.

Esto no borra el hallazgo de `bordesSemanticosMaria.test.ts`: hay 6–11 comandos
huérfanos en las piezas grandes y 7 en la pieza pequeña. El barrido calibrado
no los convirtió en selecciones parciales, pero la caída estructural de
`edgeRangeForCommand` a `[i, i + 1]` sigue existiendo y queda en #1027. La
medición permite continuar la tanda porque la puerta que necesita el gesto —un
borde semántico estable bajo el press— sí está abierta en el recorrido real.

## Decisión

La tanda 2c trabaja sobre `SemanticEdge`, no sobre comando ni pieza. El clic
sigue seleccionando ese borde entero; el arrastre nuevo escribirá un rango de
arco dentro del mismo borde. Esa separación conserva la precedencia actual y
ataca exactamente el «todo o nada» sin reabrir el hit-test ya corregido.
