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
  iteraciones por cuadro. Con 20, el gradiente conjugado sin converger frena la tela
  como un amortiguador. Medido el 2026-10-18: la tela sobre un plano a 35° con μ = 0,4
  avanza 2 mm en vez de más de 20 (falla §4.4.1), el disco de 20 mm con poca
  resistencia a encoger sigue en 55 tras 60 cuadros, y en el disco Cusick a 5 mm el
  jersey y el rib no quedan quietos y el denim tarda 8,9 s contra 4,4. En la camiseta
  a 5 mm con el jersey medido (E12), en la GTX 980, ese freno se ve como mejora: 31 ms
  por cuadro contra 53, de 1285 a 5505 desbordes contra 11186 a 12627 y la costura más
  abierta a 2,2-6,0 mm contra 6,2-10,6 mm; ninguna de las dos queda quieta en 10 s. El
  motor sigue con 50. La multimalla del subproyecto 1 es el remedio previsto.
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
el 2026-10-16 (el valor de E7 espera su ratificación), y E8 y E9 el mismo día. El mismo día ordenó usar las telas de
la referencia y dar un motor eficiente para la web y natural: de ahí E10 en adelante, cada una con lo que se midió.
Aprobó E12 y E13 el 2026-10-18, y E14 el 2026-10-19. El 2026-10-23 ordenó la rama 1, el contacto entre capas: E15
y E16, y el mismo día ratificó el valor de E15 (27,8 N/m en el jersey medido), ordenó la rama 2, la costura
soldada (E17), y después la fuerza de la costura por su largo: E18 (su valor espera la ratificación).

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
- **E10 (§4.2.1, §4.3.1 y §4.3.2; reemplaza a E4 y a la anticipación). El cuerpo es un piso duro.** El vértice libre y
  sin coser que al empezar el paso está a menos de la separación del cuerpo (más 0,1 mm de holgura), sin irse hacia
  afuera a más de 1 mm/s (el que ya estaba apoyado, por la normal con que se lo sostuvo) y sin que el cuadro anterior lo
  jalara hacia el cuerpo, queda restringido en la normal del
  cuerpo, como las restricciones de Baraff y Witkin (*Large Steps*, §5.3): el gradiente conjugado filtra esa componente
  y el vértice solo se mueve por el plano tangente, con su fricción. La fuerza de la restricción es −n·r, con r el
  residuo sin filtrar al terminar el gradiente conjugado; si jala hacia el cuerpo, el vértice se suelta el cuadro
  siguiente. La fricción usa esa fuerza, nunca menos que el peso que el vértice carga sobre el cuerpo. El vértice que el
  paso mete en el cuerpo sin estar apoyado se proyecta a la separación al terminar el paso, sin velocidad hacia adentro,
  y su fuerza de apoyo es la que lo frenó. Sin segunda ronda: el par de dos capas de tela entra activo también cuando el
  cuadro sin fuerzas (y = x_t + h·v + h²·g) lo metería en la separación. Con dos cuadros de margen, el resorte de dos
  lados de la solución jalaba una contra otra a dos capas que todavía no se iban a tocar: medido en dos láminas a 8 mm
  que se acercan a 5 mm por cuadro, la de arriba llegaba a la separación en un cuadro y salía acelerada de 0,3 a
  0,39 m/s, y en la camiseta la tela se arrugaba sobre sí misma. El par de una punta del cuerpo sigue con su resorte
  (`kContacto`). Con el resorte de 2000 N/m del cuerpo, una tela de 27 N/m quedaba con un sistema mal
  condicionado o, con un resorte blando, atravesaba el cuerpo donde la costura jalaba; la restricción no tiene rigidez.
  La velocidad de despegue del que ya estaba apoyado se mide por su normal anterior porque en un canto redondeado (el
  del pedestal del disco Cusick tiene el radio de la separación) resbalar por el plano tangente aleja al vértice de la
  normal nueva, h·v²/R (2,3 mm/s a 13 mm/s), sin despegarlo: medida con la normal nueva, el vértice se soltaba, caía, se
  proyectaba y volvía a apoyarse, en ciclos de dos cuadros que movían a mil vértices. Medido el 2026-10-17 en el disco de
  5 mm con el jersey medido (E12): la quietud baja de 0,19 a 0,03 % de la caída libre, debajo de su umbral de 0,1 %.
  *Costo:* la tela queda pegada un cuadro antes de soltarse, y la proyección no conserva la energía. Plan
  `2026-10-16-el-motor-a-s2.md`.
- **E11 (§4.4.2, se aparta de E5 en la tira del cuello). La tira del cuello arranca en anillo.** La colocación de la
  referencia deja la tira plana detrás de la cabeza, y sus costuras la jalaban en línea recta a través del cuello hasta
  el escote del delantero: el cuerpo quedaba entre los dos bordes, la puntada no cosía (E8) y la tira se estiraba de 38 a
  240 %. En el banco la tira arranca en un círculo horizontal alrededor del cuello, a la altura del punto más alto del
  escote, con el largo de reposo de su borde cosido (o rodeando el cuello a la separación si es más ancho), girada para
  que cada vértice quede frente a su punto del escote; el borde libre sube lo que mide la tira de ancho (`banco/cuello.ts`).
  Cambia el punto de partida, no la física. Plan `2026-10-16-el-motor-a-s2.md`.
- **E12 (§4.1.1 y §4.4.2). La tela medida, con la flexión ajustada en su mismo ensayo.** Las telas que midió la
  referencia (tracción de una tira colgada de su peso a lo largo, a lo ancho y en los dos bies; voladizo de Peirce en
  las tres direcciones; gramaje y grosor) entran al motor así (`banco/telasMedidas.ts`): kTrama y kUrdimbre, la rigidez
  de la tira a lo ancho y a lo largo; kCizalla, la que da a 45° la rigidez medida en bies con nuestra membrana sin
  Poisson, 1/E45 = ¼·(1/kT + 1/kU + 1/kS); y la flexión de cada dirección, G = ρ·g·c³ con la c de la fórmula de Peirce,
  multiplicada por el factor que da en el motor el mismo ángulo que la referencia con la misma tira apoyada en la mesa
  (`bench/flexionDeLaReferencia.ts`, `escenaPeirceApoyada`). La referencia apoya la tira sin sujetarla: en el borde la
  tira gira y la cola se levanta, y la fórmula de Peirce, que la supone empotrada, lee una flexión más blanda que la de
  la tela. Medido el 2026-10-16 en la CPU con tres telas (un jersey, un rib y un denim), cuatro largos por dirección y
  malla de 5 mm: el factor va de 1,9 a 2,5 por dirección (de 1,6 a 3,1 por corrida), y en el jersey a 2,5 mm queda
  entre 1,8 y 2,2, así que casi no depende de la malla. Con la flexión de la fórmula, el disco Cusick de las tres telas
  caía entre 6 y 9 puntos por debajo de la referencia; con la ajustada queda dentro de los 5 puntos de §2 en las tres:
  el jersey a una décima, el rib y el denim unos 3,5 puntos por encima. *Costo:* el ajuste corre el voladizo de cada
  tela en el motor (minutos por tela) y vale para la malla en que se ajustó (en una malla gruesa no caben las tiras
  cortas: ahí se usa el de 5 mm). El rib y el denim quedan algo rígidos en el disco: la tracción del denim no es lineal
  y el pandeo se calibró con la tela anterior del banco. Plan `2026-10-16-el-motor-a-s2.md`.
- **E13 (§4.1.3 y §4.1.5). La tela no se aplasta, y una bisagra doblada no salta.** La membrana mide largos y un
  triángulo invertido tiene los mismos que el original: nada le impedía aplastarse ni darse vuelta. En la camiseta
  quedaban triángulos al 0,1 % de su área; a lo largo del paso pasaban por cero, sus bisagras saltaban π y la búsqueda en
  línea rechazaba el paso entero y sus siete mitades, cuadro tras cuadro: la tela quedaba trabada. Bajo un quinto de su
  área (J = A/A0 < J₀ = 1/5), cada triángulo suma A0·κ·b(J), con b(J) = −(J − J₀)²·ln(J/J₀), la barrera C² de IPC: nula
  hasta J₀ y con una fuerza que crece como 1/J. κ es diez veces la tracción más rígida de la tela, la de los hilos
  trabados, y la hessiana de Gauss-Newton suma κ·b''(J)·∇J·∇Jᵀ. Desde la mitad del área la barrera tocaba el impacto del
  disco Cusick contra el pedestal (un triángulo baja a 0,19 en el tercer cuadro) y el disco dejaba de quedar quieto en
  10 s; desde un quinto queda quieto a los 2,6 s con el mismo coeficiente. Además, dentro del paso el ángulo de prueba de
  cada bisagra sigue desde el de x_t (se le suma la vuelta entera que lo deja más cerca): en un pliegue de la tela sobre
  sí misma, una bisagra cerca de 180° saltaba de +π a −π y los términos cruzados de la placa cambiaban de signo (0,2 J de
  escalón en G). Medido el 2026-10-17 con la camiseta de 10 mm en la CPU y fricción 0,8: sin los dos arreglos la búsqueda
  rechazaba todos los pasos desde el cuadro 200; con ellos acepta el paso entero casi siempre. *Costo:* un triángulo no
  puede perder más de cuatro quintos de su área sin pagar una energía que crece sin tope; donde actúa, la barrera es tan
  rígida que la precisión simple se aleja de la CPU (2,2 mm en tres cuadros con un triángulo a 0,1 de su área). Plan
  `2026-10-16-el-motor-a-s2.md`.
- **E14 (§2 y §4.4.3). La velocidad sale del criterio de éxito.** Los 17 ms de §2 eran el costo del spike sin contacto
  ni costuras (§1.2). Con todo puesto y 50 iteraciones, el perfil limpio de la camiseta suma al menos 20,5 ms de GPU;
  entrar en 17 ms deja unas 30 iteraciones, el régimen que frena la tela (§5). Manda la física: la camiseta tiene que
  quedar quieta en 10 s con 50 iteraciones, y la velocidad (17 ms y luego 8 ms) es la meta del subproyecto de
  velocidad. El banco la sigue midiendo y reportando. *Costo:* este subproyecto puede cerrar con la camiseta a más de
  17 ms por cuadro.
- **E15 (§4.3.2). La rigidez entre capas es la de la tela.** Un par entre dos capas de tela lleva la tracción más rígida
  de la tela, `max(kTrama, kUrdimbre)` (27,8 N/m en el jersey medido), y no los 2000 N/m del cuerpo; las puntas del
  cuerpo siguen con `kContacto` (R13) y `kPropio` manda si se pasa. La rigidez de membrana de un vértice es de ese orden
  y no depende de la malla: el par no agrega al sistema nada más rígido que la tela. Medido el 2026-10-23 en la CPU con
  la camiseta de 10 mm, el jersey medido y 50 iteraciones, a los 60 cuadros: con 2000 N/m, 6429 aristas atraviesan la
  tela, 1,54 % de los triángulos quedan aplastados y el estiramiento p95 es 39,7 %; con 27,8 N/m, 2586 aristas, 0,10 % y
  11,7 %. A los 600 cuadros, con 27,8 N/m: 2027 aristas, 0,06 % y 7,2 %. Con E16, en la GPU a 5 mm (tres corridas de 600
  cuadros, mismo jersey y 50 iteraciones) contra main: 4717-6773 aristas que atraviesan contra 48287-155051, 0,04-0,16 %
  de aplastados contra 1,16-2,10 %, estiramiento p95 de 4,5-5,4 % contra 38,9-77,7 %, 136-195 pliegues de más de 150°
  contra 1161-2303 y 41-43 ms por cuadro contra 56-63; la distancia p90 a la asentada de la referencia sube de 25-29 a
  31-32 mm, y ninguna corrida queda quieta. *Costo:* el par blando cede. Las costuras que cierran (1000 N/m por punto)
  arrastran la tela a través de la otra capa desde el primer cuadro, y lo que cruza no vuelve: de 129 aristas en la
  colocación a 2490 a los 20 cuadros, y a esa altura más de la mitad de los vértices que atraviesan están a dos anillos
  o menos de una costura. Plan `2026-10-23-rama-1-contacto-entre-capas.md`.
- **E16 (§4.2.1 y §4.3.2; corrige E10). El par entre capas solo empuja.** El par de dos capas de tela empuja en el paso
  si el cuadro sin fuerzas lo deja dentro de la separación, `p0 − n·U > 0` con `U = Σ w·(y − x_t)`: el que entra y el
  que se queda, y ya no el que sale. Con E10 entraba además todo el que estaba dentro (`p0 > 0`), y el resorte de dos
  lados de la solución jalaba a las capas que se separaban: dos capas a 1 mm que se alejan a 0,3 m/s quedaban pegadas un
  cuadro. La búsqueda en línea suma la energía de un lado, `½·k·max(p0 − n·U, 0)²`, de todos los candidatos, activos o
  no, y la fricción de los activos: antes no veía al candidato que el paso metía en la separación. La GPU hace lo mismo
  (`wgslPropio.ts`, `parDeVertice` y `difPar`). Medido el 2026-10-23 con la camiseta de la CPU a 10 mm, el jersey
  medido, E15 y 50 iteraciones, 600 cuadros, contra E15 solo: 1994 aristas que atraviesan contra 2128 (media de las
  muestras cada 60 cuadros del 300 al 600), estiramiento p95 final 4,9 % contra 7,2 % y 32 pasos recortados por la
  búsqueda contra 57; pero 0,10 % de aplastados contra 0,06 %, 73 pliegues de más de 150° contra 56 y la distancia a la
  asentada de la referencia, p90, 28,1 mm contra 22,9 (una corrida de cada una). *Costo:* la camiseta llega al tope de
  50 iteraciones en todos los cuadros, así que cada par decide con el cuadro sin fuerzas: el que ese cuadro saca y el
  paso deja dentro no empuja (solo lo cobra la búsqueda en línea), y el activo que el paso saca todavía jala en la
  solución. Se probó y se descartó revisar los pares dentro del gradiente conjugado: cada 10 iteraciones, el gradiente
  conjugado dejaba de converger y quedaban pares hasta 2 mm adentro; solo al converger, en la camiseta nunca corre. Plan
  `2026-10-23-rama-1-contacto-entre-capas.md`.
- **E17 (§4.3.3; corrige E1). La costura se suelda: sus dos lados con los mismos vértices.** Con E1 cada pieza se
  mallaba sola: un vértice se cosía a un punto entre dos vértices del otro lado, y los vértices de ese lado quedaban
  sueltos entre puntadas, como puntos de vuelta que E8 nunca cose. Ahora cada costura parte su tramo cosido en N
  tramos iguales en largo de arco sobre el contorno aplanado de cada lado, con N = ⌈máx(largo de A, largo de B) /
  arista⌉ para los dos (el B en el sentido del cosido y, si es parcial, en su rango); el mallador toma esas muestras
  como vértices del borde después de quitar duplicados y simplificar (`TramoDelBorde` en `mesh/cdtMesher.ts`), y lo
  que no se cose de un borde cosido se parte a la arista (`soldadura.ts`). La muestra k de A se cose al vértice k de
  B (b0 = b1, s = 0), y no queda ningún punto de vuelta: en la camiseta de María, de 841 puntos a 10 mm (390 entre
  dos vértices, 402 de vuelta) a 302, y de 1317 a 5 mm a 578, todos en un vértice. Dos costuras que se pisan en un
  borde no se sueldan y siguen con E1. Un t que cae en el de un vértice del otro lado se cose a ese vértice solo, sin
  el vecino a peso 0, que salía de su contacto propio (`costuras.ts`). La tira del cuello (E11) toma su escote
  también de los puntos donde es el lado B (`banco/cuello.ts`): solo leía los de vuelta, y sin anillo arrancaba plana
  y terminaba con el estiramiento p95 de la tira en 619 %. Medido el 2026-10-23 con el jersey medido, E15, E16 y 50
  iteraciones, 600 cuadros, contra la rama 1. En la CPU a 10 mm: 1602 aristas que atraviesan contra 2106 (la media de
  las muestras del 300 al 600, 1550 contra 1994), 357 vértices del lado malo contra 445 (223 junto a una costura
  contra 340, y 134 lejos contra 105), 0,01 % de aplastados contra 0,10 %, 54 pliegues de más de 150° contra 73 y 9
  pasos recortados por la búsqueda contra 32; pero el estiramiento p95 sube de 4,9 a 5,7 %, la distancia p90 a la
  asentada de la referencia de 28,1 a 33,1 mm, y un punto de la sisa, a unos 55 mm de la axila, queda abierto 46,6
  mm contra 13,2. En la GPU a 5 mm (tres corridas): 3893-4628 aristas que atraviesan contra 4717-6773, 465-539
  vértices del lado malo al final contra 744-983, la costura más abierta en 0,0 mm contra 1,8-10,6 (562 puntos
  cosidos, 16 en esquinas y ninguno en resorte, contra 631 en resorte), p90 a la referencia 28,0-31,2 mm contra
  31,2-31,7, 107-158 pliegues de más de 150° contra 136-195 y 799-970 desbordes de celda contra 1874-12492, con
  0,09-0,11 % de aplastados contra 0,04-0,16 % y 40-42 ms por cuadro. Ninguna corrida queda quieta y el gradiente
  conjugado llega al tope en todos los cuadros. *Costo:* la malla depende de las costuras (cambiar una costura
  vuelve a mallar sus piezas), y el lado más corto de una costura con embebido lleva aristas más cortas (la tira del
  cuello, 8,7 mm contra 9,9 del escote). Con menos puntos, el resorte de cierre (1000 N/m por punto, sin importar el
  largo que representa) jala menos: la sisa de 10 mm pasa de 118 puntos a 24, y el punto abierto arranca a 68,9 mm,
  baja a 31 mm hacia el cuadro 120 y vuelve a 46 mm desde el 180, sin llegar a los 25 mm en que E8 cose; al final su
  línea roza el cuerpo, a 0,8 mm. Plan `2026-10-23-rama-2-costura-soldada.md`.
- **E18 (§4.3.3; corrige la rigidez por punto de E1 y E17). La costura jala por su largo, no por sus puntos.** Cada
  punto de costura tenía 1000 N/m sin importar cuánta costura representaba, así que lo que jalaba una costura dependía
  de la malla: con E17, la sisa de 10 mm pasó de 118 puntos a 24. Ahora cada punto lleva el largo que representa (en
  t, hasta la mitad del camino a cada punto vecino de la costura, los de vuelta incluidos, y en las puntas hasta la
  punta del tramo, por lo que mide el tramo en el patrón de su lado: `puntosDeCostura`), y su rigidez es
  `kCosturaPorLargo` por ese largo. El valor de partida, 2·10⁵ N/m², son los 1000 N/m por punto de antes con puntos
  cada 5 mm; un punto sin largo cuenta 5 mm. La GPU lee la rigidez de cada punto. En la camiseta de María las
  costuras suman 554,6 kN/m a 10 mm y 554,7 a 5 mm, sobre 2773 mm de costura (antes, 302 y 578). Medido el 2026-10-23
  igual que E17, contra E17. En la CPU a 10 mm todas las costuras cierran (la más abierta en 0,0 mm contra 46,6: el
  punto de la sisa se cose), con 1513 aristas que atraviesan contra 1602 (la media del 300 al 600, 1615 contra 1550),
  0,01 % de aplastados como antes, 1,07 % de encogidas de más del 10 % contra 1,42, y 207 pliegues de más de 90°
  contra 235 y 42 de más de 150° contra 54; pero quedan 430 vértices del lado malo contra 357 (272 junto a una
  costura contra 223), el estiramiento p95 sube de 5,7 a 6,1 % (la manga de la sisa, de 13,9 a 17,6; con E1 era 6,1),
  la distancia p90 a la asentada de la referencia de 33,1 a 35,6 mm y la máxima de 99,8 a 136,9, y la búsqueda recorta
  69 pasos contra 9. En la GPU a 5 mm, donde la rigidez de cada punto casi no cambia (mediana 986 N/m), seis corridas
  quedan en el ruido de las tres de E17: 4129-6496 aristas que atraviesan contra 3893-4628, 467-772 vértices del lado
  malo al final contra 465-539, p90 a la referencia 26,5-32,0 mm contra 28,0-31,2, 114-182 pliegues de más de 150°
  contra 107-158, las costuras en 0,0 mm y 39,7-41,5 ms por cuadro con la máquina libre (57-78 ms en las corridas que
  compartieron la máquina con otras aplicaciones). La paridad no cambia: 14 escenas, a menos de 0,06 mm. Ninguna
  corrida queda quieta. *Costo:* la sisa se cierra, pero lejos de donde la tiene la referencia. Con las dos reglas, el
  vértice más lejano de la asentada es el mismo par cosido de la axila, la copa de la manga en (−131, 60) mm y la sisa
  del cuerpo en (224, 95), junto al punto que con 1000 N/m quedaba abierto (arrancaba a 68,9 mm en la colocación): con
  1000 N/m por punto estaba a 99,8 mm de la referencia; por su largo, a 136,9, y arrastra el cuerpo (su p90, de 37,2 a
  51,8 mm). La otra manga tiene su vértice más lejano en el mismo lugar de la copa, (131, 60), a 121,6 mm.
- **Probado y descartado: la memoria de lado.** Cada par vértice-triángulo guardaba el lado de la cara en que se lo vio
  primero, y el vértice que cruzaba recibía un par que lo empujaba de vuelta. Medido el 2026-10-23 igual que E16, con
  E15 y E16: 3019 aristas que atraviesan a los 600 cuadros contra 2106 sin memoria, una costura de la manga abierta 62
  mm contra 13 y 0,24 % de aplastados contra 0,10 %. A los 60 cuadros, el 42 % de los pares del lado malo recordaba su
  lado y empujaba, y perdía contra la costura; otro 41 % se había anotado ya cruzado. Heredar el lado a las caras
  vecinas no ayudaba: a los 60 cuadros, 526 vértices del lado malo sin heredar, 1983 heredando sin cuidar los pliegues y
  540 cuidándolos.
