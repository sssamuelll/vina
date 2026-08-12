# Verificación de la tanda 2a contra un patrón real

**Fecha:** 2026-08-12 · **Issue:** #1029 (M-221) · **Task 4** del plan
`docs/superpowers/plans/2026-08-12-tanda-2a-cimientos-de-medicion.md`

**Baseline:** `docs/reports/2026-08-12-baseline-piquetes-maria.json`, capturado
en el commit `d6cfd6cc` — antes de tocar una sola línea de la medición.
**Fuente:** `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`
**Verificado en:** `8874bc35` (Tasks 1-3 completas).

---

## Qué se prometió y qué se comprobó

La tanda cambia cómo se mide la distancia de arco a lo largo de un contorno. La
promesa que la sostiene es que **los piquetes que la usuaria ya tiene guardados
no se mueven**: un ancla sin campo `metric` se re-deriva con la métrica vieja —
el contorno aplanado a 12 subdivisiones — aunque ahora exista una mejor.

Comprobarlo tiene una trampa que hay que nombrar. Re-importar el DXF y comparar
posiciones **no** prueba eso: la importación de hoy estampa `metric: 2`, así que
se estarían comparando dos mediciones distintas. La comprobación correcta usa
las **anclas grabadas en el baseline** — que no tienen `metric`, porque son
datos viejos — contra los contornos recién importados.

Está fijado como test permanente en
`src/utils/__tests__/baselinePiquetesMaria.test.ts`, con una guarda extra: si
alguien vacía el fixture, el test falla en vez de pasar por vacuidad.

---

## Tabla 1 — Los 8 piquetes: desplazamiento cero

`distancia` en mm desde su esquina de referencia. `Δ baseline` es la distancia
entre la posición de hoy y la grabada; se compara con igualdad exacta de
flotantes (`toBe`), no con tolerancia.

| Pieza | distancia | sentido | Δ baseline (mm) | Δ v1→v2 (mm) |
|---|---:|---|---:|---:|
| PATRONES PARA SAMUEL-1 | 43,85 | ccw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-1 | 59,83 | ccw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-4 | 43,85 | ccw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-4 | 59,83 | ccw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-5 | 43,94 | cw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-5 | 43,94 | ccw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-5 | 60,79 | cw | 0,000000 | 0,000000 |
| PATRONES PARA SAMUEL-5 | 60,79 | ccw | 0,000000 | 0,000000 |

La columna que importa es la tercera, y sale a cero. La cuarta es el hallazgo.

---

## Tabla 2 — Las dos métricas coinciden en su patrón, y hay una razón

| Pieza | comandos del contorno | perímetro v1 | perímetro v2 | Δ |
|---|---|---:|---:|---:|
| PATRONES PARA SAMUEL-1 | M×1 L×200 Z×1 | 1114,6410 | 1114,6410 | 0,000000 |
| PATRONES PARA SAMUEL-2 | M×1 L×16 Z×1 | 993,6880 | 993,6880 | 0,000000 |
| PATRONES PARA SAMUEL-3 | M×1 L×192 Z×1 | 2142,4127 | 2142,4127 | 0,000000 |
| PATRONES PARA SAMUEL-4 | M×1 L×200 Z×1 | 1114,6410 | 1114,6410 | 0,000000 |
| PATRONES PARA SAMUEL-5 | M×1 L×274 Z×1 | 2244,8805 | 2244,8805 | 0,000000 |

**Cero comandos de curva en los cinco contornos.** 882 comandos `L` en total.

La causa está en el archivo, no en el importador: el DXF trae 25 entidades
`POLYLINE` con 1082 `VERTEX` y **cero códigos 42** (el bulge, que es como DXF
expresa un tramo curvo dentro de una polilínea). CLO exportó sus curvas ya
horneadas en polilíneas densas — unos 216 vértices por pieza.

Conviene decirlo con precisión: **no es que su patrón no tenga curvas.** Tiene
sisas y escotes como cualquier patrón. Lo que pasa es que llegan pre-aplanadas,
y el aplanado a 12 subdivisiones que la tanda corrige no tiene nada que
subdividir. Sobre una recta las dos métricas son idénticas por construcción.

El importador **sí** produce comandos `C`: de entidades `ARC`, `CIRCLE`,
`SPLINE` y de polilíneas con bulge (`converter.ts:139,152,185,194`). Otro
export de CLO, u otro programa, daría contornos paramétricos.

---

## Entonces, ¿cuánto se evitó mover?

En su patrón de hoy: **nada, exactamente**. El riesgo de migración para sus
datos no es «pequeño», es nulo.

En contornos con curvas de verdad, medido contra un oráculo externo
(integración numérica a 4·10⁶ muestras sobre la cúbica, en
`src/utils/__tests__/notchAnchorMetric.test.ts`):

| | error contra el arco real |
|---|---:|
| métrica v1 (12 subdivisiones) | 0,0785 mm |
| métrica v2 (Gauss-Legendre + inversión por bisección) | 0,0000008 mm |

Y sobre las cuatro curvas de patronaje medidas al escribir el plan, el
subestimado del aplanado va de 0,04 a 0,4 mm según la curvatura — más en una
sisa cerrada, casi cero en un costado casi recto.

---

## Lo que esto significa para una migración futura

Este informe existe sobre todo para el día que alguien proponga rellenar
`metric: 2` retroactivamente en las anclas viejas. Los datos para esa decisión:

1. **Para el patrón que la usuaria tiene hoy, migrar no movería nada.** Es
   tentador concluir «entonces migremos, sale gratis». Cuidado: eso es cierto
   de *este* archivo, no de la clase de todos sus archivos. Un DXF con bulges,
   un SVG importado, o cualquier pieza que ella dibuje con la herramienta de
   pluma o convierta a curva, sí tienen curvas paramétricas.
2. **La cota del movimiento es el orden de 0,1 mm**, no de milímetros. Para
   patronaje está por debajo del grosor de la línea de corte. El argumento para
   no migrar no es que el desplazamiento sea grande, es que es **innecesario**:
   nadie gana nada moviendo un piquete que ella colocó a mano.
3. **La comprobación tiene que rehacerse con un archivo que sí tenga curvas**
   antes de decidir. Este baseline no puede responder esa pregunta, y decir que
   sí puede sería el error que este documento intenta evitar.

## Verificación pendiente que este informe NO cubre

- No se ha probado con un proyecto `.openclo` guardado por ella, solo con la
  importación del DXF. Si existe uno con anclas, vale la pena repetir la Tabla 1
  contra él.
- No se ha probado ningún contorno paramétrico real — solo curvas sintéticas
  que elegimos nosotros. Es el hueco que deja el punto 3 de arriba.
