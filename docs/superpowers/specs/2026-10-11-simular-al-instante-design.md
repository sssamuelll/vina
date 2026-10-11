# Simular al instante — diseño (2026-10-11)

Primer subproyecto del programa «arranque y cámara» del drape. El segundo,
«cámara a 60 fps» (subpasos por presupuesto, colisión una vez por cuadro),
lleva su propia spec: ese sí toca la física.

## 1. Por qué

Samuel, 11-10, en su PC con Chrome: el drape «no arranca o se congela», «se
reinicia», va «lento o a tirones», y quiere «la experiencia más fina y ligera
de la industria … que no importa dónde abra este programa siempre pueda hacer
la animación de forma perfecta y fluida».

Los reinicios, las congelaciones periódicas y la vista 2D lenta ya se
arreglaron en `fix/drape-estable`. Lo que queda del arranque, medido con la
sonda (`tests/e2e/drape-sonda.spec.ts`) sobre la camisa de María en ese PC:

| Del clic en «Simular»… | Producción (fa20bfd0) | Rama fix/drape-estable |
|---|---|---|
| …a que arranca la cascada (mallar) | 8,6 s | 3,9 s (mallado en paralelo) |
| armado del solver TSL, en el hilo principal | 752 ms (congela) | 735 ms (congela) |
| colisión del cuerpo (horneado + BVH) | ~0,2 s | ~0,2 s |
| primer cuadro de física (compila los kernels en la GPU, no congela) | ~0,9 s | ~0,8 s |

Samuel eligió el criterio «< 1 s, sin congelar», que acepta preparar en
segundo plano mientras la prenda está a la vista. También eligió el enfoque A:
preparar en reposo, en cuatro entregas medidas.

## 2. Criterio de éxito

1. Con la camisa de María en el PC de Samuel (Chrome, WebGPU) y la prenda ya
   preparada, del clic en «Simular» al primer cuadro con tela en movimiento
   pasan **menos de 1 s**.
2. Del clic al asentado, **ninguna tarea del hilo principal pasa de 100 ms**.
3. **La física no cambia.** Las mismas entradas dan los mismos arreglos al
   solver, comparados elemento a elemento contra el cálculo de hoy.
4. Sin WebGPU (tiers WASM y CPU), el pre-mallado aplica igual y nada empeora.

«Ya preparada» quiere decir que la prenda estuvo a la vista en 3D o en Split,
con la simulación parada, el tiempo que tarda el preparador. Para María son
unos 4 s.

## 3. Fuera de alcance

- Cambiar la física, el mallador o la densidad de 5 mm.
- Precalentar la GPU en reposo: compilar kernels o crear buffers antes del
  clic. Samuel lo descartó: gasta GPU y memoria aunque nunca simules.
- Reusar el solver vivo entre «Restablecer» y «Simular». Eso es edición en
  vivo, otro subproyecto.
- Preparar en la vista 2D: ahí el visor no dibuja ni simula desde
  `117dfa1a`, y no tendría sentido gastar CPU en lo que no se ve.

## 4. Diseño

### 4.1 El preparador (`usePrepararTela`, montado en `Viewport3D`)

- **Cuándo corre**: con la simulación en reposo (`idle`), la vista en 3D o
  Split, la prenda visible (`showGarment`) y al menos una pieza que se simula.
  Arranca 600 ms después del último cambio de sus entradas: las piezas, las
  densidades, la colocación (medidas del cuerpo, `arrangementOverrides`,
  `armAxis`), las costuras y la tela.
- **Qué hace, en orden**:
  1. Malla con `SimulationInitClient`, que ya va en paralelo y con caché.
  2. Coloca las mallas con la función compartida del § 4.3.
  3. Arma la tela en un worker (§ 4.4) y la guarda en caché.
  4. Prepara la colisión del cuerpo (§ 4.5).
- **Cancelación**: un cambio de entradas suelta lo que está en vuelo y vuelve
  a empezar tras los 600 ms. Pulsar «Simular» **no** lo cancela: lo que está
  en vuelo se comparte (§ 4.2) y termina.
- **Errores**: el preparador no muestra nada. Si falla, la simulación prepara
  al pulsar, como hoy, por el camino lento pero correcto. El fallo queda en la
  bitácora como evento del solver `preparar:fallo` (con la fase y el mensaje).

### 4.2 Mallas: compartir lo que está en vuelo

`simulationInitClient.ts` ya guarda las mallas hechas (`mallasHechas`).
Además va a llevar `mallasEnVuelo: Map<clave, Promise<Malla>>`. Pedir una
clave que está en vuelo espera esa misma promesa. Si esa promesa falla (su
cliente se soltó porque cambiaron las entradas), el que pidió malla con su
propio worker. Así, si María pulsa «Simular» mientras el preparador malla, la
simulación no empieza de cero.

### 4.3 La colocación, compartida

El `useMemo` de `placedMeshes` en `GarmentSimulation.tsx` (envoltura sobre el
cuerpo, regiones, rigidez por entretela, internas de doblez) pasa a ser una
función pura, `colocarMallas(pieceMeshes, activePieces, medidas, overrides,
armAxis)`. `GarmentSimulation` y el preparador la llaman con las mismas
entradas y obtienen el mismo resultado. Un test compara su salida con la del
`useMemo` de hoy en la camisa de María.

### 4.4 El armado de la tela, en un worker (`prepararTela`)

- La parte de CPU de `GpuSolverClient.initMultiPieceTsl` se mueve a
  `src/utils/cloth/gpu/prepararTela.ts`, una función pura: sin `window`, sin
  three y sin GPU. Esa parte es:
  - la fusión de piezas y la masa;
  - la adyacencia;
  - las restricciones de estiramiento y flexión;
  - los coloreados;
  - el empaquetado de costuras;
  - la banda del margen;
  - los quads entre piezas, con su barrera Halberg;
  - el CSR de autocolisión;
  - la soldadura de normales;
  - los radios del tirante.

  Los interruptores de desarrollo que hoy lee de `localStorage`
  (`vina-crossbend`, `vina-seamscx`) entran como argumentos.
- `prepararTelaWorker.ts` la corre fuera del hilo principal. Si no se puede
  crear el worker, corre en el hilo principal, como hoy.
- `initMultiPieceTsl(pieces, seamPairs, config, fabric, preparada?)`: con
  `preparada` (del preparador) solo sube a la GPU y arma los nodos TSL. Sin
  ella, la calcula en el worker y después sube.
- **Caché**: 2 telas preparadas, que en María son 5-8 MB cada una. La clave
  es todo lo que entra: las claves de malla de cada pieza, las entradas de la
  colocación, las costuras, la tela y los interruptores. Al usarla se
  comprueba barato que coincide (los ids de pieza y el número de vértices); si
  no coincide, se rearma.
- **Idéntica**: un test arma la camisa de María por los dos caminos y compara
  cada arreglo elemento a elemento.

### 4.5 La colisión del cuerpo, preparada

- En reposo, el preparador hornea el cuerpo (`bakeCollisionFromRender`, ~54
  ms en el hilo principal, por debajo del límite de 100 ms) y arma su BVH
  (`bvh.ts`, ~130 ms) en un worker.
- **Caché** por cuerpo: url, medidas, morph targets y pose.
- `setCollisionMesh(mesh, friction, bvh?)`: con el BVH preparado, no lo
  reconstruye.

### 4.6 El primer cuadro, a la vista de la caja negra

- **Telemetría**: un evento del solver nuevo, `tela:primer-cuadro`
  (generación y ms desde su `cascade:start`), en el primer latido de cada
  tela. La sonda lo lee para medir el criterio 1, sin depender de las
  ventanas de 30 cuadros.
- **Compilación de kernels**: se mide la primera vez de la sesión y la
  repetición (Restablecer → Simular). Si la primera pasa de 500 ms con todo
  preparado, va la entrega 4. Esa entrega reduce los pipelines distintos
  (rangos de color como uniformes y no como constantes del WGSL) y se diseña
  aparte con su medida.

### 4.7 Lo que ve María

Del clic al primer cuadro, el estado al pie (`EstadoDeLaSimulacion`) dice que
la tela se está preparando, en vez de «Simulando» sin cifra. El texto se
escribe con solace-wren al implementarlo, y pasa por el contrato de interfaz.

## 5. Entregas

Cada entrega lleva su sonda antes y después, en WebGPU y en WASM, bajo
`scripts/pesado.mjs`.

1. Pre-mallado, compartir lo que está en vuelo, colocación compartida,
   telemetría del primer cuadro y el estado «preparando».
2. `prepararTela` idéntica, en worker y con caché.
3. Colisión preparada.
4. Solo si hace falta (§ 4.6): menos pipelines distintos.

## 6. Riesgos

- **Memoria de las cachés**: mallas (~1,5 MB por prenda, 64 piezas como
  máximo), telas preparadas (2 × 5-8 MB) y colisión (1 cuerpo, ~3 MB). Las
  tres tienen límite.
- **CPU en reposo** con el 3D a la vista: unos segundos de workers por
  cambio. El retardo de 600 ms evita mallar durante un arrastre, y en 2D no se
  prepara nada.
- **Claves incompletas**: una tela preparada que no corresponde a la que se
  simula. Las mitigaciones son la clave completa del § 4.4, la comprobación
  al usarla y el test de idéntica.
- **Workers de módulo**: Safari 15+ y Firefox 114+ los soportan. Si no se
  pueden crear, todo corre en el hilo principal, como hoy.

## 7. Verificación

- **Unitarios**:
  - compartir en vuelo (y repetir si el compartido falla);
  - `colocarMallas` idéntica;
  - `prepararTela` idéntica en María;
  - las claves y su comprobación;
  - el preparador solo corre en reposo y con la prenda a la vista.
- **Sonda**: criterio 1 (< 1 s con la prenda preparada) y criterio 2 (ninguna
  tarea de más de 100 ms). En WASM nada empeora.
- **Gate del deploy** en verde, con `simular-pausar-reanudar` dentro.
