# La tela nueva — diseño (2026-10-13)

Primer subproyecto del programa «tela nueva»: el motor base. Los que siguen, cada uno
con su spec:

1. **Velocidad y vista previa**: una cadena de mallas de la misma prenda, de gruesa a
   fina, que sirve a la vez para acelerar el cálculo (multimalla) y como vista previa
   que se afina sola hacia la forma final; más el reposo directo con su prueba de
   quietud.
2. **La prueba contra la realidad**: cuando lleguen de fábrica las primeras muestras
   hechas con patrones de Vina, se comparan con la simulación en el fit.
3. **Las telas medidas**: de dónde salen los números de cada tela y cómo se mide una
   tela nueva.
4. **El motor sin WebGPU**.

## 1. Por qué

### 1.1 Lo que pasa hoy (main @ eb8ee685)

Medido sobre la camiseta de María (`maria_patrones_samuel_2M.dxf`) asentada en el
tier WebGPU y sobre el disco del ensayo Cusick:

- **La tela se aplasta.** El 10,6 % de los triángulos de la camiseta queda con menos
  de la mitad del área de su patrón y el 19,4 % de las aristas, encogido más de 10 %.
  Casi todo está en el 10 % de cada costado del delantero y la espalda (64-69 % de
  triángulos aplastados ahí, ~0 % en el centro; mangas 0-0,1 %). La causa: la
  colocación del torso (`wrapPanel.ts:36`) apila lo que pasa de ±75° y el motor toma
  esa colocación como forma de reposo (`gpuBuffers.ts:194-200,274`), con compresión
  gratis (`tslSolver.ts:455-462`) y un tope rígido de 2 % en tracción.
- **La simulación ignora la línea de grano.** Las direcciones de la tela salen de los
  ejes del dibujo 2D (`classifyEdgeType`), no de `grainLine`.
- **El material depende de la malla y de las pasadas.** Masa igual por partícula en
  GPU y WASM; flexión por arista calibrada para 15 subpasos y malla de ~7 mm; tres
  repasos de estiramiento por subpaso porque no converge.
- **La prenda se asienta por reloj.** En el cuadro 150 se amarra cada vértice a su
  posición y se congelan costuras; el amortiguamiento por subpaso (0,96) limita la
  caída a ~0,26 m/s.
- **La flexión por arista mezcla direcciones.** En una lámina curvada sobre un
  cilindro, la energía discreta por arista es 1,9 veces la teórica a lo ancho con
  malla de 2,5 mm y 1,4 con 20 mm; al bies, 5,4 veces.
- **En el disco Cusick** con el jersey de la biblioteca: coeficiente de caída 12,7 con
  malla de 5 mm, 2 ondas (un jersey real forma de 6 a 10) y 2,6 % de triángulos
  aplastados; con 20 mm, 14,4 % aplastados.

### 1.2 Lo que mostró la prueba (rama `spike/tela-vbd`, desechable)

- Un motor «vértice por vértice» (Vertex Block Descent) no converge en tela real: en
  una tira de 61 vértices libres necesita ~500 vueltas por cuadro, y con menos se
  vuelve inestable. Se descarta.
- Euler implícito con Newton (hessiana de Gauss-Newton) y gradiente conjugado
  precondicionado, arrancando cada paso desde el estado actual, llega al equilibrio
  real (fuerza neta cero) y en el disco Cusick cae a menos de 1 punto de la referencia
  medida con malla de 5 mm, con 0 % de triángulos aplastados.
- La flexión de placa por triángulo (§4.1.5) da 0,97 / 0,94 / 0,88 de la energía
  teórica con malla de 2,5 / 5 / 10 mm, igual a lo ancho, a lo largo y al bies.
- En la GTX 980 (WGSL directo), la camiseta de 29.092 vértices cuesta 9,8 ms por paso
  con 20 iteraciones y 17 ms con 50 (matriz por bloques en franjas de 32 filas; sin
  matriz eran 68 ms). La GPU da lo mismo que la versión de CPU: 4,7 µm de diferencia
  media tras 3 pasos.
- Cuánto se resiste la tela a encoger decide si la caída depende de la malla: con
  resistencia completa, el disco pasa de 26,9 (5 mm) a 40,2 (10 mm); con el pandeo de
  Choi y Ko (§4.1.4), 27,2 / 32,5 / 27,5 a 5 / 10 / 20 mm. Falta calibrarlo.

### 1.3 Lo que se busca

Máximo realismo y máxima velocidad. Este spec lleva a Vina al nivel de la referencia
comercial con un motor que ya mide lo que hace; los siguientes buscan superarla en
velocidad, en una vista previa que no cambia al afinar y en la comparación contra
prendas reales.

## 2. Criterio de éxito

| Qué | Meta |
|---|---|
| Caída en el disco Cusick | a 5 puntos o menos de la referencia con malla de 5 mm; y el rango de coeficientes entre 5, 10 y 20 mm no supera el rango de la referencia en esas mismas mallas, comparados en décimas porque la referencia trae un decimal |
| Triángulos de la camiseta con menos de la mitad del área de su patrón | menos de 0,1 % |
| Costuras de la camiseta | separación mediana 0 mm, máxima 1 mm |
| Asentado | la camiseta queda quieta sola (§4.2.4) en 10 s de tela o menos |
| Velocidad | 17 ms por cuadro o menos con la camiseta en la GTX 980 (la meta de 8 ms es del subproyecto de velocidad) |
| Física exacta | pasan las pruebas de §4.4.1 |
| GPU igual a CPU | menos de 0,1 mm de diferencia máxima tras 3 pasos en escenas chicas |

## 3. Fuera de alcance

- La multimalla, la vista previa progresiva y el reposo directo (subproyecto 1).
- La prueba contra prendas reales (subproyecto 2).
- La medición de telas y la revisión de la biblioteca más allá de su conversión de
  unidades (subproyecto 3).
- El motor sin WebGPU: sin WebGPU sigue el XPBD de hoy (subproyecto 4).
- El cuello doblado (#1251), los pespuntes en 3D (#1253) y la animación de avatares.
- La interfaz para editar las propiedades físicas de una tela.

## 4. Diseño

### 4.1 La tela

#### 4.1.1 Qué guarda cada tela

Una tela por pieza (el modelo de datos lo permite; al principio la prenda usa una):

| Campo | Unidad | Qué es |
|---|---|---|
| `gramaje` | g/m² | peso por superficie |
| `grosor` | mm | para el contacto y el margen |
| `kTrama`, `kUrdimbre` | N/m | rigidez a la tracción a lo ancho y a lo largo |
| `kCizalla` | N/m | rigidez a la cizalla |
| `endurece` | — | curva de tracción: tramos (deformación, rigidez); vacía = lineal |
| `pandeo` | — | factor de la carga de pandeo (§4.1.4) |
| `bTrama`, `bUrdimbre`, `bBies` | µN·m | rigidez a la flexión que curva la trama, la urdimbre y al bies |
| `friccionTela`, `friccionCuerpo` | — | coeficientes de Coulomb |

Convenciones: la urdimbre corre a lo largo del hilo; «bTrama» es la rigidez cuando la
curvatura va a lo ancho (el pliegue corre a lo largo del hilo).

#### 4.1.2 Reposo y dirección del hilo

- El reposo de cada triángulo es su forma en el patrón plano: las coordenadas 2D del
  mallador (mm de patrón → m), rotadas al marco del hilo: `v` a lo largo de la línea
  de grano de la pieza, `u` perpendicular. Sin línea de grano, el hilo va vertical en
  el patrón.
- Por triángulo se guarda `Dm⁻¹` (2×2) y el área de reposo `A0`. La colocación en 3D
  solo da las posiciones iniciales; nunca el reposo.

#### 4.1.3 Membrana

Con `F = Ds·Dm⁻¹ = [f_u f_v]` (columnas en 3D):

```
E_m = A0 · [ ψ_u(|f_u| − 1) + ψ_v(|f_v| − 1) + ½·kCizalla·(f_u·f_v)² ]
```

`ψ` en tracción: lineal con `k`, o por tramos según `endurece`. Hessiana de
Gauss-Newton por componente: `k·n nᵀ + max(ψ'/s, 0)·(I − n nᵀ)` con `n = f/|f|`,
`s = |f|`; cizalla: `kCizalla·∇γ ∇γᵀ` con `γ = f_u·f_v`. A lo largo del hilo va la
rigidez `k` también en la meseta de pandeo (§4.1.4), donde `ψ''` es 0: la energía y la
fuerza siguen la ley, pero el paso no mueve gratis el hilo comprimido. Con `ψ''` la malla
de 20 mm se trababa: el hilo cruzaba a tracción en un solo paso, la energía se disparaba
y la búsqueda en línea rechazaba el paso entero.

#### 4.1.4 Compresión con pandeo (Choi y Ko)

En compresión cada dirección resiste con la misma rigidez hasta su carga de pandeo y
desde ahí la fuerza queda constante (la tela se dobla en vez de comprimirse):

```
P = pandeo · π² · B / L²      (B = bTrama o bUrdimbre; L = √(2·A0))
ψ(ε) = ½·k·ε²                         si ε ≥ −P/k
ψ(ε) = ½·k·(P/k)² + P·(−ε − P/k)      si ε < −P/k
```

La carga de pandeo depende del tamaño del triángulo: una malla gruesa representa los
pliegues que no puede dibujar como compresión barata, y una fina los dibuja. El factor
`pandeo` se calibra contra las referencias del banco en 5, 10 y 20 mm (§4.4.2).

#### 4.1.5 Flexión de placa

Por triángulo T, la curvatura `s = (κuu, κuv, κvv)` sale de los ángulos entre caras
de sus bordes interiores:

- Para cada borde k con vecino N: `θ_k ≈ g_k · s`, con
  `g_k = t_kᵀ (J_N − J_T)`. `J_T` (2×3) da la pendiente exacta del triángulo plano
  sobre la superficie `h = ½ pᵀ S p` (con un origen común para toda la pieza) y `t_k`
  es la normal del borde hacia N, en el patrón.
- Energía de placa ortótropa: `½·A0·sᵀ D s` con `D = diag(bTrama, 4·D66, bUrdimbre)` y
  `D66 = max(ε, bBies − (bTrama + bUrdimbre)/4)`.
- Con m bordes interiores (m ≤ 3) se usa la energía mínima compatible:
  `E_b = ½ θᵀ K θ`, `K = A0·(G D⁻¹ Gᵀ)⁻¹` (G de m×3). En un borde libre no queda
  momento.
- `θ` es el ángulo entre caras con signo (`dihedral.ts`), con cada bisagra orientada
  como el triángulo que tiene el ala `c`, para que todas usen la misma convención.
- Hessiana de Gauss-Newton: `Σ_kl K_kl ∇θ_k ∇θ_lᵀ`.

`K` y los mapas `J` se calculan una vez al preparar la tela.

#### 4.1.6 Masa

Cada vértice recibe `gramaje·A0/3` de cada triángulo vecino.

#### 4.1.7 La biblioteca

`physicalFabric.ts` gana los campos de §4.1.1. Las 30 telas actuales se convierten con
una regla documentada en el código:

- La flexión declarada en mN·cm pasa a N·m (× 10⁻⁵).
- La rigidez a la tracción se deduce del estiramiento declarado como si fuera bajo la
  carga estándar de 500 gf/cm: `k = 490 N/m ÷ (estiramiento % / 100)`.
- La cizalla se toma de `shearStiffness`, en N/m.

Una tela de referencia (el jersey del banco) entra con valores medidos.

### 4.2 El cálculo

#### 4.2.1 El paso

Cada cuadro avanza `h = 1/60 s` con Euler implícito en forma de energía:

```
G(x) = ½·|x − y|²_M / h² + ½·aire·|x − x_t|²_M / h + E(x) + contactos,
y = x_t + h·v_t + h²·g
```

1. Se arranca desde el estado actual (`x = x_t`).
2. Se arman el gradiente y la hessiana de Gauss-Newton en el estado actual.
3. Se resuelve `(M/h² + aire·M/h + H) Δ = −∇G` con gradiente conjugado precondicionado
   (bloques 3×3 de la diagonal), con un presupuesto de iteraciones por cuadro
   (20-50, ajustable) y una tolerancia relativa.
4. **Anticipación de contactos**: si `x + Δ` mete vértices en el cuerpo o en la propia
   tela, esos contactos se agregan al sistema y se resuelve una vez más. Medido en el
   disco Cusick de 10 mm: el término `½·k_c·(p0 − n·Δ)²` con `p0 < 0` tira de los
   vértices anticipados hasta la superficie y un poco más allá, la búsqueda en línea
   recorta el paso a 1/16 y la segunda ronda duplica el gradiente conjugado sin ganarle a
   no anticipar. La forma del contacto (restricción en el gradiente conjugado o varias
   iteraciones de Newton) se decide con el cuerpo, en la entrega 4; mientras tanto la
   anticipación se puede apagar.
5. **Búsqueda en línea**: si `G(x + Δ) > G(x)`, el paso se reduce a la mitad (hasta 8
   veces).
6. `v = (x − x_t)/h`.

Sin amarres, sin congelado por reloj y sin topes de velocidad.

#### 4.2.2 En la GPU

- WGSL escrito directo, sobre el mismo `GPUDevice` del renderer de three.js. Las
  posiciones viven en el búfer que dibuja la vista 3D, sin copias.
- La matriz se arma por bloques 3×3 una vez por cuadro: cada bloque suma los aportes
  de los elementos que lo tocan, con listas precalculadas al preparar la tela y sin
  atómicas. Se guarda en franjas de 32 filas, para que hilos vecinos lean memoria
  vecina.
- Productos escalares: reducción por grupo de trabajo y una suma final; los
  escalares viven en la GPU.
- Todo el cuadro va en un solo pase de cómputo.

#### 4.2.3 La versión de referencia en CPU

El mismo modelo en TypeScript con doble precisión (`src/utils/cloth/implicito/`). Es la
fuente de verdad de las pruebas y el patrón contra el que se compara la GPU.

#### 4.2.4 El medidor de quietud

Cada cuadro informa cuánto pide moverse la prenda: la suma de `m·|v|` de sus vértices
libres, con `v = Δ/h` la velocidad que pide el paso de Newton antes de la búsqueda en
línea, dividida por la de un cuadro de caída libre (`m·g·h`); y, aparte, el máximo por
vértice, para ubicar dónde se mueve. Se usa la velocidad pedida y no la aceptada porque
una tela trabada (la búsqueda en línea rechaza el paso entero) no se mueve, pero no está
quieta. La prenda está **quieta** cuando el total baja
de 0,1 % durante 30 cuadros seguidos (umbral que se confirma con el banco). El estado
se publica en la caja negra (`solverRuntimeTracker`) y reemplaza al asentado por reloj
del cuadro 150.

Se mide por velocidad y no por fuerza neta. En la GPU las posiciones van en precisión
simple, y la fuerza neta de una tela en reposo no baja del ruido de redondeo: en el
disco Cusick de 5 mm ya asentado, solo redondear las posiciones a precisión simple
cambia la fuerza elástica en un 11,6 % del peso total (mediana por vértice 8 %). La
velocidad sí baja de 0,1 %, y la CPU y la GPU la miden igual.

### 4.3 El cuerpo, la tela contra sí misma y las costuras

#### 4.3.1 El cuerpo

- Malla rígida del avatar con su BVH (el `bvhPreparado` de #1248).
- Entre tela y cuerpo queda `grosor/2 + 1 mm`; hoy el colchón es de 8 mm.
- Contacto de vértice de tela contra triángulo del cuerpo, y de vértice del cuerpo
  contra triángulo de tela (hombros y otras puntas).
- Energía `½·k_c·p²` sobre la normal del cuerpo y fricción de Coulomb suavizada con la
  normal del paso anterior.
- Entra en el mismo sistema (§4.2.1), con anticipación.

#### 4.3.2 La tela contra sí misma

- En cada cuadro, un hash espacial en GPU encuentra pares vértice-triángulo y
  arista-arista más cerca que el grosor.
- Sus aportes entran al producto matriz-vector como un término aparte: listas por
  vértice que se rearman cada cuadro, porque esos pares cambian. También entran al
  bloque diagonal del precondicionador.
- Llevan fricción de Coulomb suavizada, igual que el cuerpo.

#### 4.3.3 Las costuras

- Cada par cosido `(a, b)` es un resorte rígido dentro del sistema, con largo de
  reposo que se cierra hasta 0 al coser (como hoy).
- La flexión cruza la costura: los bordes cosidos cuentan como compartidos para la
  placa (§4.1.5), así la tela no hace bisagra.
- El margen de costura es una franja de ancho real (el margen del patrón, o 10 mm por
  defecto). Lleva más masa (por capas) y más flexión (factor calibrado), definidas en
  milímetros y no en anillos de malla.

#### 4.3.4 La colocación

El torso se envuelve con radio derivado del ancho del panel, como mangas y cuello, sin
apilar lo que pasa de ±75°. Así las deformaciones iniciales quedan pequeñas.

#### 4.3.5 Dependencias

Los dos errores de emparejado de #1250 (esquinas cosidas a una sola costura y la media
costura de la nuca invertida) se arreglan antes de comparar la camiseta.

### 4.4 El banco de pruebas (se construye primero)

#### 4.4.1 Física exacta (repo público, en cada cambio)

- Fuerzas iguales a −∂E/∂x y hessiana de Gauss-Newton coherente con diferencias
  finitas.
- Lámina curvada sobre un cilindro: energía de flexión entre 0,85 y 1,05 de la teórica
  con malla de 2,5, 5 y 10 mm, a lo ancho, a lo largo y al bies.
- Tira en voladizo empotrada: la punta converge a la elástica teórica al afinar la
  malla: de 2,5 a 1,25 mm el error queda en 0,6 o menos del anterior (convergencia de
  primer orden; la prueba midió 0,52).
- Un paso nunca sube `G`; el medidor de quietud marca cero en un equilibrio
  construido.

#### 4.4.2 Contra la referencia (privado, en el PC de Samuel)

Las referencias medidas en el simulador comercial viven fuera del repo, en una carpeta
privada, con los scripts que las regeneran. Las pruebas que las usan corren solo en ese
PC, con el candado de `scripts/pesado.mjs`.

- El disco Cusick (30 cm sobre pedestal de 18 cm) y la tira en voladizo (a lo largo y
  a lo ancho; 15, 25 y 40 mm fuera de la mesa), con malla de 5, 10 y 20 mm.
- La camiseta de María sobre el cuerpo por defecto de Vina, llevado al simulador como
  avatar. Se compara:
  - triángulos aplastados;
  - percentiles de estiramiento de arista;
  - separación en costuras;
  - distancia al cuerpo;
  - distribución de pliegues;
  - distancia entre superficies, en mm.

#### 4.4.3 Velocidad y quietud (@gpu-local)

Milisegundos por cuadro con la camiseta, segundos de tela hasta quieta, y la paridad
GPU = CPU en escenas chicas.

#### 4.4.4 Punto de partida

El banco corre también sobre el XPBD actual, para medir cada entrega contra él.

### 4.5 Integración

- Los datos del motor nuevo (reposo en el patrón, `Dm⁻¹`, `K`, masas, patrón de la
  matriz y listas de aportes, costuras) se arman en `prepararTela` (#1248), en el
  worker.
- El tier WebGPU elige el motor con un interruptor (`vina-motor-implicito`) mientras
  dura la validación; cuando la camiseta apruebe el banco pasa a ser el de siempre y
  el XPBD queda solo sin WebGPU.
- La colocación (§4.3.4) cambia para los dos motores.
- Las entregas que tocan archivos de ramas abiertas (`gpuSolverClient.ts`,
  `GarmentSimulation.tsx`, `useSimulationLifecycle.ts`, la colisión) esperan a que
  esas ramas entren a main.

### 4.6 Entregas

1. **El banco** (§4.4), con el XPBD medido como punto de partida.
2. **La tela y el cálculo en CPU** (§4.1, §4.2.3): pasan la física exacta y los
   ensayos de laboratorio en 5, 10 y 20 mm, con el pandeo calibrado.
3. **El motor en GPU** (§4.2.2): da lo mismo que la CPU; velocidad medida.
4. **La prenda completa** (§4.3, §4.1.7, §4.5): cuerpo, contacto propio, costuras,
   margen, colocación, biblioteca e interruptor; la camiseta contra la referencia.
5. **Motor por defecto** cuando la camiseta cumple §2.

## 5. Riesgos

- **Velocidad**: para asentar tan rápido como la referencia hacen falta ~50
  iteraciones por cuadro (17 ms). Con 20, la prenda tarda más en quedar quieta. La
  multimalla del subproyecto 1 es el remedio previsto.
- **Contacto propio en GPU**: las listas por vértice que cambian cada cuadro son la
  parte más nueva y la de mayor costo incierto.
- **Calibración**: el factor de pandeo y la rigidez del margen definen cuánto cambia la
  caída con la malla; si un solo factor no alcanza para las tres mallas, la ley de
  pandeo necesita otra forma (por ejemplo, rigidez poscrítica no nula).
- **Precisión simple**: costuras muy rígidas empeoran el condicionamiento del sistema;
  el resorte de costura se elige con el banco.

## 6. Referencias

- D. Baraff y A. Witkin, *Large Steps in Cloth Simulation*, SIGGRAPH 1998.
- K.-J. Choi y H.-S. Ko, *Stable but Responsive Cloth*, SIGGRAPH 2002.
- E. Grinspun, Y. Gingold, J. Reisman y D. Zorin, *Computing Discrete Shape Operators
  on General Meshes*, Eurographics 2006.
- A. H. Chen, Z. Liu, Y. Yang y C. Yuksel, *Vertex Block Descent*, SIGGRAPH 2024
  (medido y descartado, §1.2).
- R. Tamstorf, T. Jones y S. McCormick, *Smoothed Aggregation Multigrid for Cloth
  Simulation*, SIGGRAPH Asia 2015 (subproyecto 1).
- J. E. Zhang et al., *Progressive Simulation for Cloth Quasistatics*, SIGGRAPH Asia
  2022 (subproyecto 1).

## 7. Enmiendas de la entrega 4

Mandan sobre las secciones que citan. Samuel aprobó E1-E4 el 2026-10-14 con el plan de la parte 1, y E5, E6, R13 y E7
el 2026-10-16 (el valor de E7 espera su ratificación), y E8 y E9 el mismo día.

- **E1 (§4.3.3).** Cada vértice de una costura se cose a un punto del otro lado, ubicado por largo de arco en el
  patrón, y no a un vértice: los dos lados se mallan por separado y casi nunca tienen la misma cantidad de vértices.
  Plan `2026-10-14-la-prenda-en-la-cpu.md`.
- **E2 (§4.3.3).** La flexión cruza la costura con una bisagra por arista cosida, con la rigidez de una franja
  curvada a lo ancho, `kh = b⊥·ℓ²/(A_T + A_N)`, encendida cuando la costura cierra. Plan
  `2026-10-14-la-prenda-en-la-cpu.md`.
- **E3 (§4.3.2).** El contacto propio es solo vértice-triángulo, más vértice del cuerpo contra triángulo de tela;
  arista-arista queda para cuando el banco lo pida. Plan `2026-10-14-la-prenda-en-la-cpu.md`.
- **E4 (§4.2.1).** El contacto es un plano tangente al obstáculo, fijado al empezar el paso (o al anticiparlo, en
  el punto adonde iba el vértice), con fricción de Coulomb suavizada: de dos lados en la solución y de uno en la
  búsqueda en línea, que no consulta el cuerpo. Plan `2026-10-14-la-prenda-en-la-cpu.md`.
- **E5 (§4.4.2).** La camiseta se compara sobre el avatar de la referencia y desde su colocación inicial, llevada a
  la malla de Vina por las coordenadas del patrón; la colocación y el cuerpo de Vina los mide la parte 3. Plan
  `2026-10-14-la-prenda-en-la-gpu.md`.
- **E6 (§4.3.2).** Un par vértice-triángulo de la tela, y uno de punta del cuerpo, entra solo si el vértice cae sobre
  la cara cerrada del triángulo (con 1/1000 de tolerancia, que deja entrar al que cae justo sobre un borde o un
  vértice): los vecinos de la misma capa miran la tela de canto y nunca sostienen nada. Plan
  `2026-10-14-la-prenda-en-la-gpu.md`.
- **R13 (§4.3.1, se aparta de «con anticipación»).** Los pares de un vértice del cuerpo contra un triángulo de tela no
  se anticipan: entran cuando el vértice atravesó la tela por la cara y siguen mientras la sostiene, a menos de la
  separación. Anticiparlos los hacía competir con los planos de los vértices de tela sobre un cuerpo liso (la tela se
  trababa o temblaba). *Costo:* una punta que entra muy rápido se rescata un cuadro tarde. Plan
  `2026-10-14-la-prenda-en-la-cpu.md`.
- **E7 (§4.3.3).** El largo de reposo de una costura baja cada cuadro lo mismo que antes (×0,97¹⁵), pero nunca más de
  `cierreMaximo`: `L ← max(L·0,97¹⁵, L − cierreMaximo)`, con `cierreMaximo` = 5 mm por cuadro. Una costura que arranca a
  menos de `cierreMaximo/(1 − 0,97¹⁵)` ≈ 13,6 mm cierra como antes. Sin tope, con huecos de decenas de centímetros en la
  colocación, el primer cuadro tiraba de cada costura más de un tercio de su hueco. *Costo:* la flexión cruza las costuras
  cuando cierran todas, y con el tope eso espera a la más abierta: unos G/5 cuadros por cada G mm de hueco (en la
  camiseta, 63 cuadros; sin tope, 18). 5 mm es el valor de partida: entre 2, 5 y 10 mm, medidos el 2026-10-16 con una
  corrida por tope y antes del arreglo de las costuras parciales, los triángulos aplastados quedan dentro del ruido de la
  GPU; se queda porque con 2 mm las costuras chicas pasan 136 cuadros sin bisagra y porque 5 mm dio la menor costura
  máxima en esas corridas. La regla del plan, fijada antes de medir, escogía 2 mm: el valor espera la ratificación de
  Samuel. Plan `2026-10-16-la-camiseta-a-s2.md`.
- **E8 (§4.3.3). La puntada no cede.** Un punto de costura cuyo vértice queda a menos de `5·cierreMaximo` (25 mm,
  cinco cuadros de cierre) de su punto se cose: el vértice deja de ser una incógnita y se mueve con su punto del otro
  lado, `x_a = (1 − s)·x_b0 + s·x_b1 + d`. El desfase `d` arranca en la separación de ese momento y baja cada cuadro
  con la ley de E7 hasta 0. El paso se resuelve en las incógnitas que quedan: lo que empuja al vértice cosido lo
  cargan sus dos vértices del otro lado, y el resorte de ese punto se apaga. Se cose en cadena: un vértice puede
  coserse a un punto cuyos vértices ya están cosidos a otra costura, o sostener puntos de otras costuras, hasta tres
  niveles y sin ciclos. Cada vértice depende de un solo punto, y decide el orden de los puntos (en cada costura,
  primero los vértices de A sobre B). Los puntos de vuelta (los vértices de B sobre A) nunca se cosen, y se apagan
  cuando sus dos vértices de A ya están cosidos, porque la línea de la costura ya es la de B; en una esquina donde la
  cadena no alcanza, sigue el resorte. Tampoco se cose un punto cuya línea hasta su punto entra en un obstáculo más
  hondo que la separación (se miran sus siete puntos intermedios): cerrar a través del cuerpo deja la tela adentro, y
  ese punto sigue con su resorte. Medido el 2026-10-16 en la GPU a 5 mm: el resorte de 1000 N/m cede ante el contacto
  (un par vale 2000 N/m), 1-2 mm donde empujan otras capas o pliegues y 10-18 mm donde el cuerpo queda entre los dos
  bordes. Con 20000 N/m casi todo cierra, pero el gradiente conjugado no converge ni con 600 iteraciones y los
  aplastados suben. Con la puntada, la mediana queda en 0 mm y las costuras cierran salvo en las esquinas (1-3 mm) y
  donde el cuerpo queda entre los bordes (5-15 mm). *Costo:* mientras cierra, el desfase une los dos bordes como una
  varilla de hasta 25 mm, y un vértice cosido ya no se desliza a lo largo de la costura. Plan
  `2026-10-16-la-camiseta-a-s2.md`.
- **E9 (§4.1.4). La meseta de pandeo termina.** Pasado un encogimiento de 10 % (`TOPE_DE_PANDEO`, o el `topePandeo` de
  la tela), la tela vuelve a resistir como al estirar: ψ suma ½·k·(ε + tope)². Con la meseta sin fin, un triángulo
  podía encogerse casi gratis: en la camiseta a 5 mm, 1,53 % de los triángulos quedaba con menos de la mitad de su
  área. Sin meseta bajan a 0,17 %, pero el disco Cusick pierde el rango entre mallas (10,1 puntos: la malla de 10 mm
  se pone rígida). Medido el 2026-10-16 en la GPU a 5 mm y en el Cusick a 5, 10 y 20 mm: con el tope en 0,1, 0,28 % de
  aplastados, y el Cusick cumple (rango 2,6); con 0,05 y 0,03, 0,19 y 0,15 %, pero el Cusick pierde el rango (4,4 y
  4,1). Lo que queda aplastado está en la tira del cuello. *Costo:* la tela que encoge más de 10 % ya no se dobla
  dentro del triángulo y empuja como al estirar. Plan `2026-10-16-la-camiseta-a-s2.md`.
