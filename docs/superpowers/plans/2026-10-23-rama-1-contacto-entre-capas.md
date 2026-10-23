# Rama 1: el contacto entre capas — plan

**Goal:** la tela deja de atravesar la tela y de quedarse del otro lado. El primer parche de física del contacto propio
lleva tres cosas: una rigidez entre capas que sale de la tela, una sola regla de contacto en la solución y en la
búsqueda en línea, y la memoria del lado de cada par.

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
converge como con la tela sola) y cede ante las fuerzas de la tela lo mismo que la tela cede ante él. El cruce que se
escape lo corrige la memoria de lado, no la rigidez. Jersey: 27,8 N/m. Las puntas del cuerpo siguen con `kContacto`
(R13). `kPropio` sigue mandando si se pasa (banco).

**E16. Una sola regla: el par solo empuja.** La energía de cada par es `½·k·max(p0 − n·U, 0)²` más su fricción, en la
solución y en la búsqueda en línea, con `U = Σ w·(x − x_t)` y el plano fijo al empezar el paso. Los candidatos son todos
los pares que encuentra la rejilla; arrancan activos los que están dentro de la separación en `x_t` (`p0 > 0`). Cada
`REVISION_DE_PARES` = 10 iteraciones del gradiente conjugado, cada candidato se mira en el `Δ` de ese momento: queda
activo si `p0 − n·U(Δ) > 0`. Si alguno cambió, el residuo se corrige con lo que ese par suma o deja de sumar en `Δ`
(exacto: `r = b − A·Δ` es lineal en cada par), y el gradiente conjugado sigue desde `Δ` con `p = z`. El
precondicionador no cambia. La búsqueda en línea suma la energía de un lado de todos los candidatos, y la fricción de
los activos al terminar. Reemplaza la predicción de E10 («el par de dos capas de tela entra activo también cuando el
cuadro sin fuerzas lo metería en la separación»): el par que el paso mete en la separación entra porque el paso lo
mete, sea por la velocidad, la costura o la flexión. Las iteraciones siguen en 50.

**E17. La memoria de lado.** Cada par vértice-triángulo guarda el lado `σ = signo(t̂·e)` de la primera vez que la
rejilla lo encuentra, con `t̂` la normal orientada del triángulo; mientras siga siendo candidato cuadro a cuadro, lo
conserva. Con memoria, `n = σ·t̂` y `s0 = σ·(t̂·e)`, con signo: el vértice que cruzó tiene `s0 < 0` y `p0 = sep − s0`
lo empuja de vuelta a su lado. Sin memoria (par nuevo), `σ` es el lado de hoy y el par queda como antes. El par que
deja de ser candidato olvida su lado: un cruce que pasa entero fuera del radio de búsqueda no se ve (el mismo piso del
instrumento). En la GPU, cada vértice guarda hasta 16 pares con su lado, en dos listas que se alternan por cuadro; los
que no caben se cuentan.

## Tareas

1. **E15 en la CPU y la GPU.** La rigidez por defecto sale de la tela; prueba: sin `kPropio`, los pares de tela llevan
   `max(kTrama, kUrdimbre)` y las puntas `kContacto`.
2. **E17 en la CPU, con TDD.** Pruebas: un vértice anotado de un lado y llevado al otro (a menos del radio) recibe un
   par que lo empuja de vuelta; una lámina que cae sobre otra queda del lado en que llegó; un par nuevo ya cruzado queda
   como hoy (piso).
3. **E16 en la CPU, con TDD.** Pruebas: al terminar el gradiente conjugado ningún par activo jala (`p0 − n·U ≥ 0` o
   inactivo); la capa que viene rápido no atraviesa (la prueba de la anticipación sigue); el par que la velocidad no mete
   no jala; el residuo y la energía de la búsqueda coinciden con las diferencias finitas; `contactos.test.ts`,
   `paso.test.ts` y el resto de `src/utils/cloth/implicito` siguen en verde. La prueba que miraba la predicción («forman
   par activo antes de tocarse») pasa a mirar el resultado.
4. **La camiseta en la CPU, antes y después.** El banco de la CPU suma el instrumento del lado malo y el argumento `kp`.
   A 10 mm (y a 5 mm si cabe en el día): quietud, lado malo, aplastados, estiramiento, costuras, con el jersey medido;
   antes (main) y después, cada número con su montaje.
5. **La GPU.** E16 y E17 en WGSL, con la misma regla y el mismo orden. Paridad: las escenas de `PARIDAD` y una nueva
   con un vértice cruzado bajo otra capa.
6. **La camiseta en la GPU.** Tres corridas con instrumentos a 5 mm y 50 iteraciones, con el jersey medido y la rigidez
   de E15, contra la tabla del 2026-10-19.
7. **Cierre.** E15-E17 en §7 del spec con lo que se midió, los resultados en el doc, gates y PR.

## Fuera de alcance

La soldadura de las costuras, el presupuesto del gradiente conjugado, los triángulos estirados que la GPU no busca y la
tela de la prueba §2 (la de `referencias.json` o el jersey medido) quedan para después de medir este parche; las dos
últimas son decisiones de Samuel.
