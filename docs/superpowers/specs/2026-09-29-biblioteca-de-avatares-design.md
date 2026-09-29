# Biblioteca de avatares — diseño

> Parte 1 de 2. Esta parte: avatares ya hechos por talla, y el menú para escogerlos.
> Parte 2 (otro spec, después): la avatar a medida de una clienta, sin tocar los de la biblioteca.
> Aprobado por sección en la conversación del 2026-09-29 con Samuel.

## 1. Por qué

El avatar por defecto es un escaneo de Samuel (Avaturn, `public/default-avatar.glb`). Hace que la
herramienta no se vea profesional y es un solo cuerpo: hombre, 1,87 m. Vina necesita cuerpos de
**mujer, hombre, niña y niño en varias tallas**, con acabado de avatar de fit profesional (la
distinción de la industria: *fit avatar* técnico y neutro, no *visual avatar* idealizado).

Decisiones de Samuel que este diseño obedece:

- **Los cuerpos de la biblioteca no se deforman.** Cada talla es un cuerpo ya hecho; la app lo
  muestra tal como salió.
- **Acabado "demasiado profesional":** mezcla de generador repetible y trabajo a mano (§4).
- **Cabeza de maniquí lisa**, sin rasgos. Los avatares realistas quedan para después.
- **Tono gris A** (textura plana sRGB 0,72): se distingue del entorno blanco del 3D.

La prueba de viabilidad del 2026-09-29 (MPFB 2 en Blender 5.0, sin interfaz) generó una mujer a
170,2 / 88,9 / 70,0 / 96,0 cm y convergió en una iteración a ≤ 0,2 cm; la app la cargó sin cambios
de código con los mismos 52 huesos Mixamo del avatar actual.

## 2. Alcance

| Grupo | Tallas | Cuántas |
|---|---|---|
| Mujer | EU 32, 34, 36, 38, 40, 42, 44, 46, 48 (US 0–18) | 9 |
| Hombre | EU 44, 46, 48, 50, 52, 54, 56, 58 (pecho 88–116 cm) | 8 |
| Niña | 2, 4, 6, 8, 10, 12, 14 años | 7 |
| Niño | 2, 4, 6, 8, 10, 12, 14 años | 7 |

**31 avatares.** Una estatura típica por talla; sin petite/tall (se agregan como fila si María los pide).

Fuera de alcance: la avatar a medida (parte 2); cintas que midan la malla real (parte 2); caras
realistas; bebés y tallas grandes; migrar el resto de la interfaz al catálogo v2 (§7).

## 3. Catálogo y medidas

### 3.1 Una entrada

```json
{ "id": "mujer-eu38", "grupo": "mujer", "talla": { "eu": "38", "us": "8" },
  "archivo": "mujer-eu38.glb", "miniatura": "mujer-eu38.webp",
  "medidas": { "estatura": 168.2, "busto": 88.0, "cintura": 70.1, "cadera": 96.2 },
  "fuente": "ANSUR II", "generador": "1.0.0" }
```

Niños: `"talla": { "edad": 8 }`.

### 3.2 Las 15 medidas (definición según ISO 8559-1)

estatura, cuello, ancho de hombros, busto/pecho, bajo busto (mujer; niña ≥ 10 años), cintura,
cadera, muslo, rodilla, bíceps, talle trasero, largo de brazo, tiro, entrepierna, altura de cintura.

### 3.3 De dónde salen los números

- **Adultos: ANSUR II** (dominio público). La medida que define la talla fija su banda (busto en
  mujer: 76–108 cm cada 4; pecho en hombre: 88–116 cada 4). El resto es la **mediana de las personas
  reales de esa banda**: proporciones medidas, no inventadas.
- **Niños: NHANES** (CDC, dominio público), por edad y sexo: estatura, cintura, cadera, muslo, largo
  de brazo. NHANES no mide el pecho de niños: sale de la malla y se publica tal cual.
- Sesgo conocido: ANSUR II mide militares, más atléticos que la población. Si las tallas grandes se
  ven atléticas, se corrige en la escultura base (§4.2), no en los números.

### 3.4 Regla del catálogo

**El catálogo publica lo que mide la malla terminada, no lo que se pidió.** Las medidas que el
generador ajusta —estatura, busto/pecho, cintura, cadera, cuello, hombros, largo de brazo,
entrepierna— deben quedar a **≤ 0,5 cm** del objetivo o la generación de esa talla falla. Las demás
solo se miden y se publican.

### 3.5 Nombres y licencia

Numeración EU y US en adultos, edad en niños. **Nunca "conforme a ASTM"**: las tablas ASTM, ISO y EN
son de pago y no se reproducen. El texto de la app dice "Medidas calculadas a partir de ANSUR II"
(o NHANES). Investigación completa: el informe de estándares del 2026-09-29 (ASTM D5585/D6240/
D6192/D6458, ISO 8559, EN 13402, Alvanon, SizeUSA: todos de pago o sin permiso de redistribuir;
la alta costura no tiene estándar de tallas).

## 4. El generador — `scripts/avatares/`

### 4.1 `tallas.mjs` — de los datos a la tabla

Descarga ANSUR II y NHANES, verifica sha256 de cada archivo y escribe `scripts/avatares/tallas.json`
(las 31 tallas con sus medidas objetivo y, por número, de qué columna y banda salió). Al repo va
`tallas.json` y el script; los datos crudos no.

### 4.2 `acabado/<grupo>/*.target` — el trabajo a mano

Deformaciones MPFB (desplazamientos sobre la topología base), una carpeta por cuerpo base. Como
comparten topología, **una escultura hecha sobre una talla se aplica a todas las del grupo**; corregir
la cadera de la 44 es corregir la escultura y regenerar las nueve.

Contenido del acabado:
- cabeza de maniquí lisa: sin ojos, boca ni orejas marcadas; cuello limpio;
- pecho y entrepierna suavizados de maniquí;
- manos y pies simplificados; los dedos se conservan (el rig los usa para posar).

Dos maneras de producirlas, mismo formato de salida:
1. **Script** que alisa regiones sobre los grupos de vértices de MPFB (cara, pezones, entrepierna)
   y guarda el desplazamiento como `.target`.
2. **Escultura en la interfaz de Blender**, guardada con la herramienta de targets de MPFB, para los
   retoques finos.

**Nada entra al repo sin que Samuel lo apruebe viendo la hoja de contactos (§4.4).**

### 4.3 `generar.py` — Blender sin interfaz, una avatar por llamada

1. Verifica la versión de MPFB fijada (aborta si no coincide).
2. Crea el cuerpo base con los macros del grupo: sexo, edad (niños: la edad real mapeada al macro
   de MPFB; el mapeo se verifica en el plan), proporciones.
3. Aplica el acabado del grupo (§4.2).
4. Ajusta la estatura (bisección del macro `height`) y luego las medidas con los targets
   `measure-*` de MPFB por Newton con jacobiano numérico (la prueba convergió en una iteración).
5. Rig `mixamo` de MPFB, huesos renombrados sin el prefijo `mixamorig:` (coinciden con los 52 de
   hoy), horneado de shape keys, quita los ayudantes (modificador de máscara), pies en el suelo.
6. Material gris A: textura plana 4×4 px, porque la app pone el color del material en blanco en
   modo visible (`AvatarModel.tsx:662`).
7. Mide las 15 **sobre la malla final**: circunferencia = perímetro de la envolvente convexa del
   corte horizontal, tomando solo el anillo del torso (componente conexa más centrada), como una
   cinta; longitudes = recorrido sobre la superficie.
8. Escribe el GLB, su entrada de catálogo y la miniatura WebP (frente y perfil, ~20 KB).

Compresión: el GLB pasa por **meshopt** (`@gltf-transform/cli`) a ~300 KB; la app registra
`MeshoptDecoder` (viene en `three/examples/jsm/libs`) en los dos `GLTFLoader`
(`meshImporter.ts:217`, `vrmLoader.ts:27`). Sin wasm que alojar.

### 4.4 Cómo se corre

`npm run avatares` genera las 31 en paralelo (~6 min) y arma una **hoja de contactos** con todas en
fila (no se commitea). Requiere Blender 5.0 + MPFB en la máquina que genera; nunca corre en el
servidor ni en el deploy: los GLB generados se commitean.

## 5. Integración con la app

- **Escoger un avatar** fija `project.avatar = { id, name, modelUrl: "/avatares/<id>.glb",
  measurements }`, con las medidas del catálogo traducidas a las claves existentes de
  `BodyMeasurements` (`height`, `chest`, `waist`, `hips`, `lowBust`, `neckCirc`, `thighCirc`,
  `kneeCirc`, `upperArmCirc`, `neckToWaistBack`, `armLength`, `crotchLength`, `inseam`,
  `waistHeight`, `shoulder`). El patronaje paramétrico y el copilot las ven sin cambios
  (`reactiveSolverMiddleware.ts:238`, `autoSewThunk.ts:47`, `measurementTools.ts`).
- **Los cuerpos no se estiran.** `computeMorphWeights` deja de comparar contra un hombre fijo de
  180 cm (`DEFAULT_MEASUREMENTS`) y compara contra **las medidas de referencia del avatar cargado**.
  Con un avatar de la biblioteca todo da 1,0. Los dos llamadores reciben la referencia:
  `AvatarModel.tsx:507` (render) y `avatarMeshExtractor.ts:287` (colisión por URL). Un modelo subido
  por la usuaria sigue usando la referencia de hoy.
- **Editar medidas con un avatar de la biblioteca** cambia las del patrón, no el cuerpo. El panel lo
  dice: "El cuerpo es la talla Mujer EU 38; tus cambios se usan en el patrón."
- **Guardado:** hoy `stateToProject` guarda `avatar` pero no `avatarModelUrl`, y al reabrir se pierde
  el modelo. Al cargar, `avatarModelUrl` sale de `avatar.modelUrl`.
- **Catálogo:** `src/avatares/catalogo.json`, escrito por el generador e importado al compilar; GLB y
  miniaturas en `public/avatares/`, descargados al escogerse.
- **Por defecto:** un proyecto nuevo arranca con **Mujer EU 38**. `public/default-avatar.glb` se
  borra. Sigue la subida de modelo propio (OBJ, FBX, GLB, VRM) y el modo maniquí de costura.
- **Sin tocar:** colisión y simulación (la tela ya choca contra la malla renderizada,
  `renderCollisionBake.ts`; el cambio de `avatarModelUrl` ya dispara la reconstrucción). Las cintas
  siguen con su cálculo de hoy (2πr desde medidas), que ahora coincide con el cuerpo.

## 6. El menú

**Se construye con piezas del catálogo de componentes (contrato de interfaz v2, §7).** Es su primera
pantalla.

**Puerta:** tarjeta del avatar en uso arriba del panel Avatar (miniatura, "Mujer EU 38 · US 8",
busto/cintura/cadera) con botón **"Cambiar avatar"**; entrada "Cambiar avatar" en la paleta de
comandos; el icono de avatar del 3D ya abre el panel.

**Galería:** modal `overlay`, portal a `document.body`, `data-superficie="modal"`,
`aria-label="Biblioteca de avatares"`.

```
┌─ Biblioteca de avatares ─────────────────────────────────── ✕ ┐
│ [Mujer 9] [Hombre 8] [Niña 7] [Niño 7]                        │
├───────────────────────────────────────┬───────────────────────┤
│ tarjetas ~96 px: miniatura, talla,    │ render grande         │
│ medida que define la talla;           │ Frente · Perfil       │
│ "En uso" en la actual                 │ nombre + las 15 en cm │
│                                       │ "Medidas calculadas a │
│                                       │  partir de ANSUR II"  │
│                                       │ [ Usar este avatar ]  │
└───────────────────────────────────────┴───────────────────────┘
```

- Clic en tarjeta = seleccionar (el detalle cambia; el proyecto no).
- "Usar este avatar" = cambia, cierra y muestra toast con **Deshacer** (`showUndoToast`).
- Teclado: flechas en la cuadrícula, Enter selecciona, Esc cierra, foco atrapado en el modal.
- Seleccionada > hover > reposo, cambiando relleno y borde, no solo tono. Todo en español.

## 7. Dependencia: contrato de interfaz v2

El contrato actual (skill `contrato-de-interfaz`, `scripts/ui-contract-lint.mjs`) es de
prohibiciones y congela el desorden en vez de reducirlo: 1 componente compartido, 189 `<button>`
crudos, 19 clases de botón, 21 tamaños de letra, 22 radios, 68 paddings, 308 estilos inline, 565
colores literales (2026-09-29). Falta un **vocabulario cerrado**: catálogo de piezas, escalas de
espaciado y tipografía, y la regla "una feature no crea elementos; si falta, se agrega al catálogo
primero". Se diseña en su propio spec. La galería (§6) espera a que existan sus piezas; el generador
(§4) y la integración (§5) no.

## 8. Orden

1. Generador: `medir_test.py`, `tallas.mjs`, `generar.py` (una talla de cada grupo) → hoja de
   contactos → acabado a mano → las 31. Revisión de Samuel (y María) en la hoja de contactos.
2. Integración §5 (catálogo importado, referencia de estiramiento, guardado, meshopt, nuevo
   defecto, borrar el avatar de Samuel).
3. Contrato v2 (spec propio) → galería §6.

## 9. Pruebas

- **Cinta:** `medir_test.py` dentro de Blender sobre figuras de valor conocido (cilindro r = 10 cm
  → 62,83; caja → perímetro exacto; un cuerpo con brazo pegado → el anillo del torso, no el brazo).
- **Generador:** falla si una medida ajustada queda a > 0,5 cm o si faltan huesos de los 52.
- **Unitarias:** esquema zod del catálogo (31 entradas, archivos existentes, medidas en rango
  `avatarLibrary.ts`); `computeMorphWeights(m, m)` da 1,0 en todo; cargar un proyecto restaura
  `avatarModelUrl` desde `avatar.modelUrl`; mapeo de claves catálogo → `BodyMeasurements`.
- **E2E (entran a la lista de `deploy-prod.sh`):** la puerta abre la galería; escoger y usar pide
  `/avatares/<id>.glb` y muestra el toast; Deshacer vuelve al anterior; Esc cierra; foco atrapado;
  proyecto nuevo pide `mujer-eu38.glb` y nunca `default-avatar.glb`.
- **Trinquetes:** contrato de interfaz y superficies por acción (≤ 4) en verde con la galería.

## 10. Riesgos

- **Peso del repo:** ~31 × 300 KB + miniaturas ≈ 10 MB por generación; regenerar reescribe los
  binarios. Regenerar solo cuando cambia algo que se ve.
- **MPFB cambia de versión:** fijada y verificada por el generador.
- **Mapeo edad → macro de MPFB** en niños: sin verificar; se mide en el paso 1 del orden.
- **Licencia:** los números salen de datos públicos; los textos de la app no nombran estándares de
  pago como conformidad.
