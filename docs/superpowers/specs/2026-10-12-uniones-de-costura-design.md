# Uniones de costura cerradas — diseño (2026-10-12)

Subproyecto de la épica #1249 (fidelidad de la prenda simulada), issue #1250.
Los otros tres (#1251 tira doblada, #1252 compresión, #1253 pespuntes) llevan
su propia spec.

## 1. Por qué

La camisa de María asentada en 3D deja ver el avatar por huecos donde se
juntan las costuras: sisas, puntas del hombro, lados del cuello y la nuca.

**Caso de referencia.** `tests/fixtures/garments/maria_patrones_samuel_2M.dxf`
(cinco piezas, 15 costuras de auto-sew), tier GPU (TSL), preset `normal`
(5 mm), avatar por defecto, build eb8ee685, geometría de render (triángulos de
la tela más los puentes aplicados) a los 25 s de simular.

Los lazos de borde de esa geometría se separan en dos clases sin ambigüedad:
las cuatro aberturas de la prenda (ruedo, cuello, dos puños) tienen entre 2 y
3 % de sus vértices en pares de costura; todos los demás, el 100 %. Esos son
los huecos:

| Dónde | Piezas en el borde | Perímetro |
|---|---|---|
| Nuca, en el cierre de la tira | tira, espalda | 183,8 mm |
| Punta del hombro izquierdo | delantero, manga izq., espalda | 58,0 mm |
| Lado del cuello | tira, delantero, espalda | 51,2 mm |
| Sisa izquierda | delantero, espalda, manga izq. | 49,6 mm |
| Costura del hombro derecho | delantero, espalda | 49,1 mm |
| Sisa derecha | manga der., delantero, espalda | 40,4 mm |
| Punta del hombro derecho | manga der., delantero, espalda | 36,4 mm |
| Escote (tres lazos) | tira, delantero | 13,9 a 21,1 mm |
| Catorce lazos más, alrededor de las dos sisas | mangas, delantero, espalda | 2,1 a 7,5 mm |

Los 767 pares de costura quedan a una mediana de 2,46 mm; 33 pasan de 5 mm
(`SEAM_FILL_SEWN_THRESHOLD_M`) y el máximo es 33,1 mm.

### 1.1 Causas

Medidas sobre el mismo caso, con el mallador, el emparejado y el auto-sew de
eb8ee685.

**C1. La esquina entra en una sola de sus dos costuras (todas las uniones,
los tres tiers).** En el DXF cada borde termina en un punto y el siguiente
empieza en una copia exacta de ese punto: en el delantero, `sideSeam` termina
en el punto aplanado 3 y `armhole` empieza en el 4, a 0,000 mm. Las 31
uniones entre bordes de las cinco piezas repiten así su punto. `removeDuplicatePoints`
(`src/utils/mesh/cdtMesher.ts:197`, tolerancia 0,1 mm) deja una sola copia y
`projectOntoOutline` le da al vértice el origen de la primera (3).
`parameterizeEdgeFromBoundary` (`src/utils/cloth/seamAssembly.ts:387`) toma
los vértices de borde con origen dentro de `[fs, fe]`; para `armhole`,
`fs = 4`, y la esquina queda fuera. Cada esquina entra solo en la costura del
borde que termina en ella. Las piezas se tocan por un rodeo de bordes de
~5 mm en vez de en un punto, y los pares vecinos no bajan del umbral: en la
sisa izquierda la esquina del delantero (#4101) está en la costura de la sisa y
no en la del costado, y el último par del costado (#4100 con #15135) queda a
10,6 mm.

**C2. Una media costura de la tira está al revés (auto-sew).** `edgeWorld`
(`src/utils/autoSew/worldRefine.ts:61`) ubica las puntas de un sub-rango t por
índice de punto aplanado. La orilla de cuello de la tira es una sola recta
(dos puntos), así que en `back.neckline[0.5,1] ~ collarNeckEdge[0.578,1]` las
dos puntas caen en el mismo punto: recto 226 mm, cruzado 226 mm, y queda
`reversed=false`. La punta libre de la tira se cose al lado del cuello y el
punto donde la tira pasa del delantero a la espalda, a la nuca: pares de 17,1 y 33,1 mm, el cierre de
la tira abierto entre 6 y 13 mm y el hueco de la nuca. Medidas por longitud de
arco, como mide el solver, las cuatro medias costuras salen bien y con margen:
305 contra 351 mm (delanteras, sin invertir) y 307 contra 264 mm (traseras,
invertidas).

**C3. Los puentes se deciden una sola vez.** `filterSewnBridges` corre una vez,
en el cuadro 150 (`TETHER_SETTLE_FRAMES`, `GarmentSimulation.tsx:77`; se
aplica en `GarmentSimulation.tsx:700-716`). Un par que cose después se queda
sin puente: en la costura del hombro derecho hay cuatro puentes retenidos cuyas
compuertas están hoy entre 3,9 y 4,8 mm (el lazo de 49,1 mm).

**C4. Nada tapa el centro de una unión.** `buildSeamFillBridges`
(`src/components/Viewport3D/seamFill.ts:68`) solo une pares consecutivos de una
misma costura. Aunque todos los pares de una unión cosan, el polígono entre los
extremos de las costuras que se encuentran queda abierto.

## 2. Criterio de éxito

En el caso de referencia, asentado:

1. **Ningún hueco.** Solo quedan las cuatro aberturas de la prenda. Un hueco es
   un lazo de borde de la geometría de render con al menos la mitad de sus
   vértices en pares de costura.
2. **Ningún par de costura a más de 5 mm.**
3. **Las fotos del banco (§ 4.3) pasan la revisión de Samuel.**

La primera entrega (§ 5) cumple además, por sí sola:

4. Toda esquina entre dos bordes cosidos está en las dos costuras, en los tres
   tiers, con el mismo número de pares en CPU, WASM y GPU.
5. Las cuatro medias costuras de la tira cosen sus puntas libres al centro de
   la espalda y sus puntos de corte a los lados del cuello.
6. Nada empeora contra main, medido con el banco: menos pares por encima de
   5 mm y menos perímetro total de huecos.

## 3. Fuera de alcance

- Puentes en CPU y WASM. Hoy solo la rama GPU de `GarmentSimulation` los
  aplica; va en un issue aparte.
- Vértices duplicados donde una línea interna toca el contorno (hilo y línea
  central de la tira): issue aparte.
- La tira doblada (#1251), la compresión (#1252) y los pespuntes (#1253).
- El piso físico de 2 mm de las costuras y el umbral de 5 mm.
- Herramientas que reabren una costura después de aplicar sus puentes
  (`meshGrab`, `steamBrush`).

## 4. Diseño

### 4.1 La esquina, en sus dos costuras (C1)

`parameterizeEdgeFromBoundary` decide qué vértices de borde pertenecen a un
borde. Pasa a recibir los puntos aplanados del contorno (los mismos con los
que se calcula el rango) en lugar de su cantidad (`flatCount` sale de
`flat.length`) y, antes de elegir, extiende
`[fs, fe]` sobre las copias exactas de sus puntas: mientras el punto anterior a
`fs` esté a menos de la tolerancia de `removeDuplicatePoints`, `fs` retrocede;
lo mismo `fe` hacia adelante, con vuelta por el cierre del contorno. Así la
esquina, que el mallador guarda con el origen de su primera copia, entra en los
dos bordes. La tolerancia se exporta desde `cdtMesher.ts` para que las dos
partes no se separen.

Los tres llamadores ya aplanan el contorno para sacar la cantidad; ahora pasan
el arreglo: `buildSeamConstraints` (CPU y WASM), `resolveSeamVertexPairs` en
`seamPairs.ts` (GPU y la superficie de observabilidad) y `elasticAssembly.ts`
(elásticos, mismo defecto). Ninguno cambia de forma; cada costura gana el par
de su esquina en cada punta donde faltaba.

### 4.2 La dirección de las medias costuras (C2)

`edgeWorld` ubica las puntas del sub-rango por longitud de arco a lo largo del
borde aplanado, interpolando dentro del segmento: la misma medida que usa
`parameterizeEdgeFromBoundary` para t. El punto medio sigue siendo el de la
cuerda entre esas puntas, de modo que la asignación de parejas del paso 1 mejora
con la misma corrección.

`SEAM_ENGINE_VERSION` pasa de 2 a 3. `isStaleAiSeam` marca como viejas las
medias costuras de collar de motores anteriores al 3 (las de copa siguen
viejas solo antes del 2), y los proyectos guardados reciben el aviso de
«Re-coser» que ya existe.

### 4.3 El banco de fidelidad

**Las medidas** viven en un módulo puro, `src/utils/cloth/huecosDeLaPrenda.ts`,
con sus pruebas unitarias:

- `lazosDeBorde(indices, posiciones)`: las componentes del grafo de aristas de
  borde (las que tienen un solo triángulo), con sus vértices y su perímetro en
  mm.
- `medirUniones({ indices, posiciones, puentes, umbralMm })`: clasifica cada
  lazo en hueco o abertura (al menos la mitad de sus vértices en pares de
  costura), da la separación de los pares (mediana, p90, máximo, cuántos pasan
  del umbral, los diez peores con sus vértices) y cuántos puentes se aplicaron y
  cuántos siguen retenidos con las compuertas cosidas.

**El recorrido**, `tests/e2e/banco-fidelidad.spec.ts`, repite el gesto de la
sonda del drape con sus mismos helpers: abrir la app vacía, cargar el DXF de
María, «Coser piezas automáticamente», vista 3D y «Simular». A los 25 s lee la
geometría viva de `window.__VINA_CLOTH_MESH__` (índices, posiciones,
`userData.seamFillBridges`), mide con el módulo y guarda en
`.tmp/banco-fidelidad/<instante>/` el `resumen.json` y seis fotos con las vistas
del teclado: frente (2), espalda (8), derecha (4), izquierda (6) y los dos tres
cuartos (1 y 3). Corre con GPU real contra el build, en el puerto 5192 y bajo
el candado (`node scripts/pesado.mjs --nombre=fidelidad-banco`). En la primera
entrega guarda las medidas y afirma solo lo básico (la tela cargó y no hay
NaN); el criterio 6 sale de comparar su resumen en main y en la rama. En la
segunda afirma los criterios 1 y 2.

### 4.4 Segunda entrega: puentes tardíos y tapas (C3, C4)

La primera entrega mide lo que queda; esta parte se ajusta a esa medida y
Samuel la aprueba antes de escribirla.

- **Puentes tardíos.** Los puentes retenidos en el cuadro 150 se guardan como
  pendientes. En cada lectura periódica de posiciones posterior (la que ya
  corre cada 15 cuadros), `seamFill.ts` filtra los pendientes y devuelve los
  que ya cosieron; se agregan al índice y salen de la lista. El cambio en
  `GarmentSimulation.tsx` se reduce a esa llamada.
- **Tapas.** Con los mismos datos, un lazo de borde cuyos vértices estén todos
  en pares de costura, con todos esos pares cosidos y perímetro bajo un tope
  (fijado con la medida de la primera entrega), se cierra con un abanico de
  triángulos desde su primer vértice, en el índice de render. Cero vértices
  nuevos, igual que los puentes.

## 5. Entregas

1. **C1, C2 y el banco.** Ninguno toca `GarmentSimulation.tsx`,
   `useSimulationLifecycle.ts` ni `costurasDeLaSimulacion.ts`. El PR trae la
   tabla de antes y después del banco y las fotos.
2. **C3 y C4,** con su ajuste aprobado. Toca `GarmentSimulation.tsx`, que el
   PR #1248 también modifica: va después de que #1248 entre a main, y se mide
   sobre esa base.

## 6. Riesgos

- **Esquinas con dos costuras.** El vértice de la esquina recibe dos
  restricciones en lugar de una. Es lo que pasa en una prenda real, pero puede
  cambiar el reparto de fuerzas en la sisa y el hombro (donde ya se vio la
  cuerda de la sisa atravesar el hombro convexo). El banco compara la
  separación de los pares y las fotos antes y después.
- **Conteos de pares.** Las pruebas que fijan cantidades exactas de pares
  cambian. La paridad CPU, WASM y GPU se mantiene porque los tres pasan por la
  misma función.
- **El aviso de «Re-coser»** aparece en proyectos con costuras de collar del
  motor 2. Es lo buscado.
- **El arranque preparado (#1248)** cambia lo que pasa antes del cuadro 150.
  Por eso la segunda entrega se mide después de su merge.

## 7. Verificación

- Unitarias:
  - Un contorno sintético con la esquina repetida: el vértice de la esquina
    está en las costuras de sus dos bordes.
  - María, mallada a 5 mm: toda esquina entre dos bordes cosidos está en las
    dos costuras, con `seamInitDataToPairs` y con `buildSeamConstraints`, y los
    dos dan la misma cantidad de pares.
  - María: auto-sew más `refineSeamsInWorld` cose las puntas libres de la tira
    al centro de la espalda y sus cortes a los lados del cuello (hoy falla en
    `back.neckline[0.5,1]`).
  - `isStaleAiSeam`: media costura de collar del motor 2, vieja; media de copa
    del motor 2, no; de collar del motor 3, no.
  - `huecosDeLaPrenda`: un cuadrado con un agujero da un hueco; una tira sin
    coser, una abertura; los conteos de puentes salen de un caso armado a mano.
- Gates del repo: `npx tsc -b --noEmit`, `npm run test`, `npm run lint` y
  `npm run lint:ui`.
- Banco en GPU sobre main y sobre la rama, con la tabla y las fotos en el PR.
