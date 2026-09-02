# Tres iconos del dock que dicen otra cosa

> Diseño · 2026-09-02 · GitHub #1101 · Trello [#229](https://trello.com/c/A2Ki5wSS)
> Feedback de María en audio del 2026-08-30, `grabacion-2.mp4`

## 1. El problema, en sus palabras

Tres iconos del dock 2D prometen una cosa y la herramienta hace otra. Lo dijo en
tres momentos distintos de la misma grabación, cada uno al llegar a la
herramienta:

| Minuto | Herramienta | Lo que dijo |
|---|---|---|
| 00:26 | Línea interna | «me confunde mucho el icono este de línea interna porque parece que aquí pueda crear triángulos cuadrados y círculos… yo lo dibujaría como una línea intermitente» |
| 21:18 | Coser | «el icono está raro, parece que ahí es el icono de crear curvas» |
| 28:14 | Piquete | «yo pensaría que va a quedar un triángulo… lo pondría como una línea y otra línea perpendicular… o una muesca» |

Los tres diagnósticos son correctos y la causa es la misma: el icono se eligió
por parecido con el *nombre* del concepto en abstracto, no por parecido con
**lo que la herramienta deja dibujado en el patrón**.

| Herramienta | Icono hoy | Qué dice ese glifo | Qué hace la herramienta |
|---|---|---|---|
| Línea interna | `Shapes` (triángulo + cuadrado + círculo) | «crear formas geométricas» | traza una línea dentro de una pieza |
| Coser | `Spline` (curva bézier con dos nodos) | «crear una curva» | une dos bordes con una costura |
| Piquete | `Triangle` (triángulo relleno) | «un triángulo» | marca una muesca en el borde |

El de línea interna es el peor de los tres: `Shapes` describe literalmente la
función que ella *creyó* que tenía, y que además es una función que pidió por
separado (formas geométricas, Trello #228). El icono le prometió una herramienta
que no existe.

## 2. El criterio

Del contrato de interfaz, § «Lo que NO se hace en Vina»:

> Cambiar el set de iconos por diferenciarse: que el icono se **reconozca** vale
> más.

Así que la regla de este cambio no es «iconos más bonitos», es: **el glifo dibuja
el rastro que la herramienta deja en el patrón.** Una patronista reconoce una
línea discontinua, una costura y un piquete porque los dibuja a mano desde antes
de usar software.

De ahí sale el segundo criterio, el que decide entre candidatos: si el glifo
existe como convención de patronaje, gana esa convención sobre cualquier
metáfora de software.

## 3. Alcance

Cambian **tres iconos** en `src/components/shell/dock2dTools.ts`. No cambia:

- el orden del dock ni el conjunto por defecto (`DEFAULT_DOCK_2D_IDS`),
- las etiquetas en español («Línea interna», «Coser», «Piquete») — el glosario
  manda y ya son correctas,
- los atajos (`G`, `N`, `⇧N`),
- ningún otro icono del dock, aunque haya candidatos discutibles: **este cambio
  toca solo los tres que ella nombró.**

## 4. Lo que cuesta: el tipo del icono

`DockToolDef.icon` está tipado como `LucideIcon`. Lucide tiene 5797 glifos y
**ninguno** para «puntada» ni para «piquete» — son vocabulario de patronaje, no
de interfaz de software. Los dos hay que dibujarlos.

Eso no es deuda nueva: `src/tools/definitions/*.tsx` ya tiene ~59 iconos SVG
propios en línea (`circle.tsx`, por ejemplo). Lo que falta es que el catálogo del
dock los admita:

```ts
export type DockIcon = LucideIcon | React.FC<{ size?: number }>;
```

`Dock.tsx:57` los pinta con `<Icon size={16} />`, así que cualquier componente
con esa firma entra sin tocar el render.

Los glifos propios se dibujan en la rejilla de Lucide para que no desentonen al
lado de los otros diez: viewBox 24×24, `stroke-width` 2, `currentColor`, extremos
y uniones redondeados, contenido dentro de 20×20.

## 5. Los tres glifos

### 5.1 Línea interna — dos candidatos

**A · `SquareCenterlineDashedHorizontal` (Lucide).** Una pieza con una línea
discontinua dentro. Dice las dos mitades del concepto: es una línea, y va
*dentro* de una pieza.

**B · Propio: línea diagonal discontinua.** Literal a lo que ella pidió («una
línea intermitente»), sin pieza alrededor.

```
A: <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h3"/>
   <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3"/>
   <path d="M12 20v2"/><path d="M12 14v2"/><path d="M12 8v2"/><path d="M12 2v2"/>

B: <path d="M4 20 8 16"/><path d="M10 14 14 10"/><path d="M16 8 20 4"/>
```

**El riesgo de A, y por qué esto se decide mirando y no leyendo:** «Margen de
costura» ya usa `SquareDashed`. A y `SquareDashed` son los dos «cuadrado +
discontinuo» y quedarían a cuatro botones de distancia en el dock. Cambiar un
icono confuso por otro que colisiona con su vecino no arregla nada. Hay que
verlos juntos, en fila, al tamaño real.

**Recomendación: B**, y no por gusto — porque es el único de los dos que no puede
colisionar con Margen, y porque es exactamente lo que ella dijo. A gana en
riqueza semántica y pierde en el único criterio que importa aquí, que es que se
distingan de un vistazo a 16 px.

### 5.2 Coser — propio, y aquí el diseño cambió al medirlo

**Lo que ella describió no sobrevive a 16 px, y esto se descubrió renderizando,
no razonando.**

El primer intento fue literal a su frase: dos bordes y las puntadas que los
cruzan. En papel es el símbolo de costura de toda la vida. En el dock, a 16 px,
**se lee como una almohadilla `#`**.

No es un problema de afinado. Se renderizaron trece variantes a 16 px reales
(`deviceScaleFactor: 1`, ampliadas después sin suavizado) y **las seis de la
familia «dos bordes» dieron `#` sin excepción**: tres puntadas o dos, poco
inclinadas o muy inclinadas, bordes largos o cortos, alineados o desplazados. La
causa es estructural: dos horizontales más marcas verticales equiespaciadas
**es** una rejilla a ese tamaño, y una rejilla de 2×3 es el carácter `#`.

Las otras siete tampoco: dos arcos enfrentados se leen como un teléfono; el hilo
en zigzag y la puntada en X, como pajaritas; una puntada larga cruzando, como el
signo `≠`; bordes desplazados, como un rayo; `Merge` de Lucide, como un monigote.
La aguja con hilo funciona a 16 px, pero al enderezarla para que el hilo salga
del ojo —como debe ser, y una patronista lo nota— se convierte en una **flecha**.

**Lo que queda en pie: una sola línea con las puntadas atravesándola.**

```
<path d="M3 12h18"/>
<path d="m5 8 3 8"/><path d="m11 8 3 8"/><path d="m17 8 3 8"/>
```

Quitar la segunda horizontal elimina la rejilla y las puntadas vuelven a leerse.
Conserva lo que ella pidió —puntadas, no una curva— y conserva la regla del § 2:
sigue siendo el rastro que la herramienta deja, no el instrumento.

**El suplente, si a ella no le dice nada:** la aguja con hilo de la ronda 2
(`M21 3 10 14` · `m16 4 4 4` · `M10 14c-4 2-5 5-3 6s4-2 3-4`). Rompe la regla
del § 2 —es el instrumento— pero el dock ya tiene tres instrumentos (tijeras,
regla, pluma), así que el precedente existe. Su costo: compite visualmente con
esos tres, que también son diagonales finas.

### 5.3 Piquete — propio, dos candidatos

**A · Muesca en V sobre el borde.** El piquete tal como queda cortado en la tela.

```
<path d="M3 8h18"/><path d="m9 8 3 7 3-7"/>
```

**B · Marca perpendicular.** Más sobrio, literal a «una línea y otra línea
perpendicular».

```
<path d="M3 8h18"/><path d="M12 8v8"/>
```

**Recomendación: A.** B se lee como una «T» o como un icono de alineación; la V
solo puede ser una muesca.

## 6. Lo que esta maqueta NO decide

Escrito aquí a propósito, porque un mockup de un solo caso fija decisiones falsas
que nadie revisa después:

1. **El estado seleccionado.** El contrato (§ 4) exige que `seleccionado` pese
   más que `hover`, y que no dependa solo del tono. Estos tres glifos son de
   trazo, sin relleno, igual que los otros diez del dock — hay que mirarlos
   activos, no solo en reposo.
2. **Los otros diez iconos.** Ella nombró tres. No sabemos si los demás le dicen
   lo correcto, porque nadie se lo preguntó. No se tocan aquí, pero tampoco están
   ratificados.
3. **El dock a 1366×643**, que es su pantalla. Los tres glifos nuevos tienen más
   trazos que los que reemplazan (5 el de coser, contra 3 de `Spline`). Hay que
   verlo a tamaño real en su viewport, no ampliado.
4. **Si el problema era el icono o la etiqueta.** La etiqueta ya decía «Línea
   interna» y aun así entendió «formas geométricas». Eso sugiere que en el dock
   el icono pesa más que el texto — vale confirmarlo antes de dar el cambio por
   suficiente.

## 7. Verificación

- `dock2dTools.test.ts` fija el orden y el conjunto por defecto: tiene que seguir
  verde sin tocarlo (si hay que tocarlo, es que el cambio se salió del alcance).
- Contrato de interfaz: `node scripts/ui-contract-lint.mjs` — ningún contador
  puede subir. Los glifos nuevos usan `currentColor`, así que no entran en R3
  (color literal).
- Captura del dock a 1366×643, antes y después, para la entrega a María.
- Los tres glifos no se declaran terminados hasta verlos **en fila con los otros
  diez**, en reposo y activos.
