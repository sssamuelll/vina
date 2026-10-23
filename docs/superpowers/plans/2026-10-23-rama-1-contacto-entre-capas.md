# Rama 1: el contacto entre capas — plan

**Goal:** la tela deja de atravesar la tela y de quedarse del otro lado. El primer parche de física del contacto propio
llevaba tres cosas: una rigidez entre capas que sale de la tela, una sola regla de contacto en la solución y en la
búsqueda en línea, y la memoria del lado de cada par. Quedan las dos primeras (E15 y E16 en §7 del spec, con lo que se
midió); la memoria de lado empeoró la camiseta y se descartó.

**Spec:** `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (§4.2.1, §4.3.2, §7). El diagnóstico y la decisión
están en el doc «Cloth Engine: Shirt Diagnosis» (corridas del 2026-10-19, PR #1264): en las nueve corridas la tela
cruza la tela desde los primeros cuadros y no vuelve; con la misma tela, pasar de 2000 a 50 N/m baja los vértices del
lado malo un 45 %, los aplastados de ~1 % a < 0,2 % y el estiramiento p95 de 20-29 % a 5-7 %. Samuel aprobó el
alcance de la rama 1 y ordenó empezarla el 2026-10-23. El valor de la rigidez espera su ratificación antes del merge.

## Punto de partida (main `3a750fc7`)

- La normal de un par es `n = e/|e|`, del triángulo al vértice, del lado en que esté (`sistema.ts`, `armarParesPropios`;
  `wgslPropio.ts`, `parDeVertice`): el vértice que cruzó queda sostenido del lado malo.
- La solución trata el par activo como un resorte de dos lados, `f = k·(p0 − n·u)` (`sistema.ts:548`), y la búsqueda
  en línea como uno de un lado, `½·k·max(p0 − n·u, 0)²` (`contactoPropio.ts:134`). El par que la predicción del cuadro
  sin fuerzas activa con `p0 < 0` jala las capas hasta la separación (E10).
- La búsqueda en línea solo cuenta los pares activos: el paso que mete un vértice en un candidato no activo no paga nada.
- La rigidez entre capas es `kPropio ?? kContacto`: 2000 N/m, la del cuerpo; el jersey medido tiene 27,4 y 27,8 N/m.

## Diseño

**E15. La rigidez entre capas es la de la tela.** `kPropio` por defecto = `max(kTrama, kUrdimbre)`. En la
discretización del motor, la rigidez de membrana de un vértice es del orden de la tracción de la tela en N/m, y no
depende de la malla; un par con esa rigidez no agrega al sistema nada más rígido que la tela (el gradiente conjugado
converge como con la tela sola) y cede ante las fuerzas de la tela lo mismo que la tela cede ante él. Jersey: 27,8 N/m.
Las puntas del cuerpo siguen con `kContacto` (R13). `kPropio` sigue mandando si se pasa (banco).

**E16. El par solo empuja.** El par de dos capas empuja en el paso si el cuadro sin fuerzas lo deja dentro de la
separación (`p0 − n·U(y − x_t) > 0`): el que entra y el que se queda, y ya no el que sale, que E10 sostenía y dejaba a
las capas pegadas un cuadro. La búsqueda en línea suma la energía de un lado de todos los candidatos y la fricción de
los activos. Se probaron dos maneras de revisar los pares dentro del gradiente conjugado: cada 10 iteraciones, el
gradiente conjugado dejaba de converger y quedaban pares hasta 2 mm adentro; solo al converger, la revisión deja cada
par empujando o sin hacer nada (en dos láminas al azar, convergidas, nada jala más de 0,01 µm), pero la camiseta llega
al tope de 50 iteraciones en todos los cuadros y nunca corre. No entra.

**Descartado: la memoria de lado (E17 del plan).** Cada par vértice-triángulo guardaba el lado de la primera vez que se
lo vio; con memoria, `n = σ·t̂` y `s0` con signo, y el vértice que cruzó recibía un par que lo empujaba de vuelta. En la
camiseta empeoró los cruces y abrió una costura de la manga (§7 del spec). El código de la CPU y de la GPU quedó fuera.

## Tareas

1. **E15 en la CPU y la GPU.** Hecho, con su prueba.
2. **E16 en la CPU y la GPU, con TDD.** Hecho: las capas que se separan no quedan pegadas, la búsqueda en línea cuenta
   cada candidato, las capas que se acercan quedan a la separación en el cuadro en que se tocan. Cada prueba se vio caer
   con su mutación.
3. **La memoria de lado.** Hecha en la CPU y la GPU, medida y descartada.
4. **La camiseta en la CPU, antes y después.** Hecho: tres corridas de 600 cuadros a 10 mm con el jersey medido (E15
   solo, E15 y E16, E15 a E17), con el instrumento de las aristas que atraviesan la tela.
5. **La GPU.** Hecho: E15 y E16 en WGSL; la paridad pasa en todas las escenas de `PARIDAD` (las de 20 N/m pasan
   `kp=20`, porque E15 deja los pares de la tela de laboratorio en 600 N/m).
6. **La camiseta en la GPU.** Hecho: tres corridas con instrumentos a 5 mm y 50 iteraciones, con el jersey medido, en
   la rama y en main, con el instrumento de las aristas que atraviesan la tela (§7 del spec, E15).
7. **Cierre.** E15 y E16 en §7 del spec, los resultados en el doc, gates y PR.

## Fuera de alcance

La soldadura de las costuras, el presupuesto del gradiente conjugado, los triángulos estirados que la GPU no busca y la
tela de la prueba §2 (la de `referencias.json` o el jersey medido) quedan para después de medir este parche; las dos
últimas son decisiones de Samuel.
