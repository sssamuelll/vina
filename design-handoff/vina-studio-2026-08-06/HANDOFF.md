# Vina Studio — identidad + interfaz
Paquete de traspaso · 2026-08-06

## Qué hay aquí

- **Vina Studio - Interfaz.dc.html** — el archivo vivo. Contiene, en este orden:
  1. La pantalla principal de producto (2D / 3D con la banda-pieza y la muesca).
  2. 3B · las dos manos del logotipo en juego (A = Caveat 500, E = Nothing You Could Do).
  3. 3C · la paleta Contraluz.
  4. 3E · las cuatro ediciones especiales aprobadas.
- **Vina Studio - Marca.dc.html** — exploración anterior de marca (histórico).
- **Vina Studio - Identidad.dc.html** — exploración anterior (histórico).
- **logo/** — SVG editables (positivo, negativo, solo símbolo), texto convertido a curvas. Abren en Illustrator o Inkscape.
- **support.js** — runtime necesario para abrir los .dc.html. No tocar.
- **Vina Studio - PAQUETE.html** — copia autónoma para ver sin nada instalado (fuentes y todo incrustado). Solo lectura.

## Cómo abrirlo
Arrastra la carpeta completa a Claude Design y abre `Vina Studio - Interfaz.dc.html`.
Los tres archivos .dc.html necesitan `support.js` en la misma carpeta.

## Decisiones cerradas

**Logotipo.** El piquete: rectángulo con una muesca en V poco profunda en el borde superior, "ina" manuscrito a la derecha de la muesca, "STUDIO" en mono debajo y centrado.
- Contorno y V: trazo 2,5 (sobre caja de 190 × 112). No se toca nunca.
- Trazado del marco: `M8 2.5H87.5L109.5 44L133.5 2.5H187V109.5H8Z` — la V está desplazada 5 unidades a la derecha respecto al primer trazado, para cerrar el hueco con la letra.
- "ina": Caveat, peso **500** (fuente variable; 500 es un valor intermedio elegido a propósito, no la negrita). Cuerpo 53,2 en la caja de 190 × 112, es decir 0,28 × ancho del logo.
- "STUDIO": JetBrains Mono, tracking 0,3em.
- La mano E (Nothing You Could Do) sigue en juego como alternativa, sin decidir.

**Tipografías** (todas de Google Fonts, ya enlazadas en el archivo):
Caveat · JetBrains Mono · Archivo · Inter · Nothing You Could Do.

**Paleta Contraluz** — ver bloque 3C del archivo para los valores y las muestras.

**Interfaz.** La marca no se pone en la esquina como sello. La banda superior *es* la pieza: 56 px de alto, con una muesca de 88 × 72 en el centro que muerde la costura entre la vista 2D y la 3D. Los menús de cada vista van dentro de la banda, cada uno a su lado de la costura. El pico de la V queda libre a propósito: candidato a botón del agente, o a mostrar la herramienta activa. Sin decidir.

**Ediciones especiales aprobadas** (bloque 3E). Regla: la pieza y la muesca no cambian de forma nunca; solo entra el color.
- Cinta de vídeo — RGB desalineado.
- Orgullo — seis franjas al bies cruzando marco, V y letra a la vez.
- Neón de verdad — tubo rosa encendido con halo.
- Fuego — degradado de llama recorriendo el contorno de abajo arriba.

## Abierto
- A vs E como mano definitiva.
- Qué vive en el pico de la V.
- Interacción real de la pantalla 2D/3D.
