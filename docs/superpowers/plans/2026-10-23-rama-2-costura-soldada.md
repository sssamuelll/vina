# Rama 2: la costura soldada

**Spec:** `docs/superpowers/specs/2026-10-13-tela-nueva-design.md` (§4.3.3, E1, E8, §7). El diagnóstico está en el doc
«Cloth Engine: Shirt Diagnosis»: con la rama 1 (E15 y E16), lo que sigue cruzando viene de las costuras, y a los 20
cuadros más de la mitad de los vértices que atraviesan están a dos anillos o menos de una costura. Samuel ordenó el
2026-10-23 la soldadura primero, medida con los mismos instrumentos que la rama 1.

## El defecto

Cada pieza se malla sola, así que los dos lados de una costura casi nunca tienen los mismos vértices. E1 cose cada
vértice de un lado a un punto entre dos vértices del otro, y E8 lo cose ahí; los vértices del otro lado quedan sueltos
entre puntadas (los puntos de vuelta se apagan cuando la línea ya es la de B). Censo de la camiseta de María a 10 mm
(rama 1): 937 puntos de costura, 442 caen entre dos vértices del otro lado y 462 son de vuelta; solo 33 caen en un
vértice. La copa de la manga trae hasta 2,4 veces los vértices de la sisa. El 2026-10-16 ya se había medido lo que
cuesta: los vecinos de cada punto cosido se ven como dos capas y se empujan 1-2 mm, y los puntos de vuelta quedan a
1,6-2,7 mm, el lado con más vértices arrugado entre puntadas. La referencia cose los dos lados sobre los mismos vértices.

## El diseño

Los dos lados de cada costura se mallan con los mismos vértices, y cada punto de costura cae en un vértice del otro
lado. E8 no cambia: al cerrar, el vértice cosido deja de ser incógnita y se mueve con su compañero, así que la costura
cerrada es una sola arista, como en una malla única.

1. **Las muestras** (`implicito/soldadura.ts`). Por costura, cada lado se recorre en el sentido del cosido (B al revés
   si va al revés) sobre el contorno aplanado de su pieza, y el tramo cosido (el rango parcial, si lo hay) se parte en
   N tramos iguales en largo de arco, con N = ⌈máx(largo de A, largo de B) / arista⌉ para los dos lados. En cada borde
   con una costura, lo que no se cose se parte a la arista. Dos costuras que se pisan en un borde no se sueldan:
   siguen con E1.
2. **El mallador** (`mesh/cdtMesher.ts`). Opcional, por pieza: tramos del contorno con sus puntos. Después de quitar
   duplicados y simplificar, los puntos del contorno que caen dentro de un tramo se cambian por los del tramo. Sin
   tramos, nada cambia (la app sigue igual).
3. **Los lados** (`soldadura.ts`). Cada muestra se busca en la malla por su lugar en el contorno (`boundaryOrig`), y
   los dos lados de la costura salen muestra a muestra con el mismo t (k/N).
4. **El punto en el vértice** (`costuras.ts`, `sobre`). Un t que coincide con el de un vértice del otro lado se cose a
   ese vértice solo (b0 = b1, s = 0): sin peso nulo en el vecino, que además salía de su contacto propio.
5. **La camiseta del banco** (`banco/camiseta.ts`) se malla soldada en la CPU y en la GPU.

## Tareas

1. Mallador con tramos: prueba primero (un rectángulo con un tramo en un lado; un contorno de más de 200 puntos que
   simplifica; uno al revés).
2. Muestras y lados: prueba primero (dos rectángulos de largos distintos, un rango parcial, B al revés).
3. El punto en el vértice: prueba primero.
4. La camiseta soldada: prueba primero (a 10 y 20 mm, todo punto en un vértice y sin puntos de vuelta).
5. Censo antes y después; la camiseta en la CPU (10 mm, 600 cuadros, el montaje C de la rama 1) y en la GPU (5 mm,
   tres corridas con instrumentos), contra la rama 1.
6. E17 en §7 con lo medido, los resultados en el doc, gates y PR apilada sobre la rama 1.

## Fuera de alcance

El cierre (el resorte hasta 25 mm, el desfase de E8), la fuerza de la costura, la proyección y el presupuesto del
gradiente conjugado. Si la soldadura no baja lo que cruza, la corrida dice cuál sigue, con la orden de Samuel.
