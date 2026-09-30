# Biblioteca de avatares, paso 2: la integración con la app — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que un proyecto nuevo arranque con Mujer EU 38 de la biblioteca en vez del escaneo de Samuel. El cuerpo no debe estirarse cuando María edita medidas, el proyecto debe guardar y recuperar su cuerpo, y las GLB comprimidas con meshopt tienen que abrir en los dos cargadores.

**Arquitectura:** `src/avatares/catalogo.ts` importa `catalogo.json` al compilar y traduce cada entrada a las claves de `BodyMeasurements`. Dos funciones deciden qué cuerpo hay:
- `medidasDelCuerpo(project)` da las medidas del cuerpo que se ve en 3D. Con uno de la biblioteca son las de su talla, aunque María edite las del proyecto, que van al patrón. Con un modelo propio o con el maniquí de costura son las del proyecto, como hoy.
- `referenciaDeMorph(url)` da contra qué se estira el cuerpo. Uno de la biblioteca se compara consigo mismo, así que todo da 1,0.

Todo lo que dibuja, coloca o choca contra el cuerpo lee de ahí. El patrón sigue leyendo `project.avatar.measurements`.

**Tecnología:** React 18, Redux Toolkit, three.js r184 (`GLTFLoader` y `MeshoptDecoder` de `three/examples/jsm`), vitest y Playwright. Las pruebas usan `@gltf-transform/*` y `meshoptimizer`, que ya están en devDependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-biblioteca-de-avatares-design.md`, aprobado por Samuel el 2026-09-30. Este plan cubre:
- el paso 2 de su § 8, que es la § 5 entera;
- el registro de `MeshoptDecoder` de la § 4.3;
- de las pruebas de la § 9, las que no son de la galería.

La galería (§ 6) espera al contrato de interfaz v2 (§ 7).

## Global Constraints

- **Los cuerpos de la biblioteca nunca se deforman:** ni morph ni escalado a las medidas del proyecto (§ 5). "Editar medidas con un avatar de la biblioteca cambia las del patrón, no el cuerpo."
- **Texto del panel, tal cual el spec** con el nombre completo de la talla: "El cuerpo es la talla Mujer EU 38 · US 8; tus cambios se usan en el patrón." Nombres de talla: "Mujer EU 38 · US 8", "Niña 8 años" (los mismos del generador).
- **`public/default-avatar.glb` es el escaneo de Samuel:** se borra con `git rm` y no queda copia en `public/`.
- **El modelo propio sigue funcionando como hoy:** OBJ, FBX, GLB y VRM se estiran contra el hombre de 180 cm (`DEFAULT_MEASUREMENTS`), y el modo Maniquí sigue las medidas del proyecto.
- **Antes de tocar la interfaz, la skill `contrato-de-interfaz`.**
  - `node scripts/ui-contract-lint.mjs` en verde.
  - Nada de colores, z-index ni clases nuevas: la nota usa `.ap-hint`, que ya existe.
- **Typecheck:** `npx tsc -b --noEmit`. El hook de pre-commit lo corre; sin `--no-verify`.
- **Commits:**
  - con rutas explícitas, nunca `git add -A`;
  - `.maria-avatar.mjs`, sin trackear en la raíz, no es parte de esto;
  - estilo `feat(avatares): …` en español, y al final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **El e2e nuevo entra a la lista de `scripts/deploy-prod.sh`.** Antes de cualquier e2e, verificar que el 5174 es el Vite de vina: `tachira_3d` lo ocupa a veces.
- **Rama:** `feat/avatares-integracion`, desde main `1365bbdd`.

## Desvíos del spec

Medidos el 2026-09-30 leyendo el código. Van en el cuerpo de la PR para Samuel.

1. **La colocación sigue al cuerpo, no a las medidas del proyecto.** Esto abarca:
   - la vista previa del arreglo, los puntos de anclaje y las cintas;
   - la siembra de la simulación y el cosido automático;
   - las herramientas del copilot que colocan piezas y los atajos que colocan piezas.

   El spec pone `autoSewThunk.ts:47` entre lo que "ve las medidas sin cambios", pero esa línea no es del patrón: calcula dónde quedan las piezas en 3D (`resolveArrangementWithFrames`). Si el cuerpo ya no se estira y la colocación sigue leyendo las medidas editadas, pasa esto: María baja el pecho 20 cm y las piezas se siembran 3,2 cm más adentro, con `GAP` = 3 cm, o sea dentro del cuerpo; o sube la estatura 10 cm y los hombros de la prenda quedan 8 cm por encima de los del cuerpo.
2. **Hay un segundo estiramiento que el spec no nombra.** `AvatarModel.tsx:295` escala el cuerpo entero a `height`, y `Viewport3D.tsx:872` le pasa la estatura del proyecto. Ahora recibe la del cuerpo.
3. **"Restablecer"** (sale cuando hay un modelo propio cargado) vuelve al cuerpo de la biblioteca del proyecto (`avatar.modelUrl`). El rótulo de un modelo propio sin nombre dice "Modelo propio". Antes decía "Avatar por defecto", y ahora el defecto es una talla con nombre.
4. **Semántica de claves (se queda el mapeo del spec, pero se dice).**
   - `cuello` es el contorno bajo la nuez, y `neckCirc` en Seamly es la base del cuello.
   - `hombros` es el ancho biacromial recto.
   - `largo_brazo` es el brazo recto, y el de Seamly se toma con el codo doblado.

## Review Focus

1. **Un proyecto guardado antes de este cambio** (`avatar.modelUrl` vacío o `/default-avatar.glb`, medidas de 180 cm) abre con Mujer EU 38 y conserva sus medidas para el patrón. El cuerpo no se estira a 180. → Tarea 4 (URL normalizada, medidas intactas) y Tarea 3 (`medidasDelCuerpo`).
2. **Un modelo subido por la usuaria (blob) se estira, escala y coloca como hoy**, contra las medidas del proyecto. → Tarea 3 (blob → medidas del proyecto; referencia `DEFAULT_MEASUREMENTS`).
3. **Editar cualquier medida con un cuerpo de la biblioteca solo cambia el patrón.** El cuerpo, su colisionador, los anclajes, las cintas y las semillas de la simulación se quedan sobre la EU 38, y ninguna pieza se siembra dentro del cuerpo. → Tarea 3 (unitarias, `applyMorph` y la prueba de repo que lista a los lectores).
4. **El modo Maniquí con una URL de la biblioteca sigue las medidas del proyecto**, porque el maniquí es paramétrico. → Tarea 3 (caso `dressform`).
5. **La GLB comprimida abre en el navegador real y guardar → reabrir conserva el cuerpo.** → Tarea 2 (unitaria de `importMesh` y prueba de repo de los cargadores), Tarea 4 (carga) y Tarea 5 (e2e).

---

### Tarea 1: el catálogo dentro de la app

**Archivos:**
- Modificar: `tsconfig.app.json` (agregar `resolveJsonModule`)
- Crear: `src/avatares/catalogo.ts`
- Prueba: `src/avatares/__tests__/catalogo.test.ts`

**Interfaces:**
- Consume: `src/avatares/catalogo.json` (31 entradas, las escribe `generar-todas.mjs`), `parseProfilesJson` de `src/utils/avatar/avatarLibrary.ts`, `Avatar` y `BodyMeasurements` de `src/types/types.ts`.
- Produce:
  - `interface EntradaDeCatalogo`;
  - `CATALOGO: readonly EntradaDeCatalogo[]`;
  - `CLAVES: Readonly<Record<string, keyof BodyMeasurements>>`;
  - `medidasDeEntrada(e): BodyMeasurements`;
  - `nombreDeTalla(e): string`;
  - `urlDeModelo(e): string`;
  - `avatarPorUrl(url: string | null | undefined): Avatar | undefined`, que devuelve **la misma referencia** en cada llamada;
  - `AVATAR_POR_DEFECTO: Avatar`, que es el mismo objeto que `avatarPorUrl('/avatares/mujer-eu38.glb')`.

- [ ] **Paso 1: la prueba que falla**

`src/avatares/__tests__/catalogo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  AVATAR_POR_DEFECTO, CATALOGO, CLAVES, avatarPorUrl, medidasDeEntrada, nombreDeTalla, urlDeModelo,
} from '../catalogo';
import { parseProfilesJson } from '../../utils/avatar/avatarLibrary';

const entrada = (id: string) => CATALOGO.find((e) => e.id === id)!;

describe('catálogo de avatares en la app', () => {
  it('trae las 31 tallas, cada una con su GLB y su miniatura publicadas', () => {
    expect(CATALOGO).toHaveLength(31);
    const faltan = CATALOGO.flatMap((e) => [urlDeModelo(e), `/avatares/${e.miniatura}`])
      .filter((url) => !existsSync(path.resolve('public', `.${url}`)));
    expect(faltan).toEqual([]);
  });

  it('cada medida del catálogo tiene su clave en Vina', () => {
    const sinClave = CATALOGO.flatMap((e) => Object.keys(e.medidas)).filter((k) => !(k in CLAVES));
    expect(sinClave).toEqual([]);
  });

  it('las medidas de las 31 pasan la validación de perfiles (claves obligatorias, 5–500 cm)', () => {
    const t = Date.UTC(2026, 8, 30);
    const perfiles = CATALOGO.map((e) => ({
      id: e.id, name: nombreDeTalla(e), measurements: medidasDeEntrada(e), createdAt: t, updatedAt: t,
    }));
    const r = parseProfilesJson(JSON.stringify(perfiles));
    expect(r).toMatchObject({ success: true, rejected: 0 });
  });

  it('traduce Mujer EU 38 clave por clave', () => {
    expect(medidasDeEntrada(entrada('mujer-eu38'))).toEqual({
      height: 161.4, chest: 88, waist: 77.1, hips: 97, shoulder: 36.1, armLength: 53.7, inseam: 77.7,
      neckCirc: 31.6, lowBust: 73.2, thighCirc: 57.5, kneeCirc: 35.1, upperArmCirc: 26.5,
      neckToWaistBack: 38.2, crotchLength: 61.7, waistHeight: 101.5,
    });
  });

  it('un niño no trae bajo busto', () => {
    expect(medidasDeEntrada(entrada('nino-8'))).not.toHaveProperty('lowBust');
  });

  it('nombra la talla como el generador', () => {
    expect(nombreDeTalla(entrada('mujer-eu38'))).toBe('Mujer EU 38 · US 8');
    expect(nombreDeTalla(entrada('nina-8'))).toBe('Niña 8 años');
  });

  it('el avatar por defecto es Mujer EU 38, y la búsqueda por URL da siempre el mismo objeto', () => {
    expect(AVATAR_POR_DEFECTO).toMatchObject({
      id: 'mujer-eu38', name: 'Mujer EU 38 · US 8', modelUrl: '/avatares/mujer-eu38.glb',
    });
    expect(avatarPorUrl('/avatares/mujer-eu38.glb')).toBe(AVATAR_POR_DEFECTO);
    expect(avatarPorUrl('/avatares/hombre-eu50.glb')).toBe(avatarPorUrl('/avatares/hombre-eu50.glb'));
    for (const ajena of ['', null, undefined, '/default-avatar.glb', 'blob:http://localhost/1']) {
      expect(avatarPorUrl(ajena)).toBeUndefined();
    }
  });
});
```

- [ ] **Paso 2: verla fallar**

Correr: `npx vitest run src/avatares/__tests__/catalogo.test.ts`
Esperado: FAIL, con `Failed to resolve import "../catalogo"`.

- [ ] **Paso 3: el código mínimo**

En `tsconfig.app.json`, dentro de `compilerOptions`, después de `"moduleDetection": "force",`:

```json
    "resolveJsonModule": true,
```

`src/avatares/catalogo.ts`:

```ts
/**
 * La biblioteca de avatares dentro de la app (spec 2026-09-29 § 5). El generador
 * (`scripts/avatares/generar-todas.mjs`) escribe `catalogo.json`; la app lo importa al compilar
 * y baja cada GLB de `public/avatares/` cuando hace falta.
 */
import type { Avatar, BodyMeasurements } from '../types/types';
import catalogo from './catalogo.json';

export interface EntradaDeCatalogo {
  id: string;
  grupo: string;
  talla: { eu?: string; us?: string; edad?: number };
  archivo: string;
  miniatura: string;
  medidas: Record<string, number>;
  fuente: string;
  generador: string;
}

export const CATALOGO: readonly EntradaDeCatalogo[] = catalogo;

/** Del catálogo a `BodyMeasurements`. El patrón las usa como vienen, aunque algunas no se tomen
 *  donde las toma Seamly: `cuello` va bajo la nuez (Seamly: la base), `hombros` es el ancho
 *  biacromial recto y `largo_brazo` es con el brazo recto (Seamly: codo doblado). */
export const CLAVES: Readonly<Record<string, keyof BodyMeasurements>> = {
  estatura: 'height',
  busto: 'chest',
  cintura: 'waist',
  cadera: 'hips',
  hombros: 'shoulder',
  largo_brazo: 'armLength',
  entrepierna: 'inseam',
  cuello: 'neckCirc',
  bajo_busto: 'lowBust',
  muslo: 'thighCirc',
  rodilla: 'kneeCirc',
  biceps: 'upperArmCirc',
  talle_trasero: 'neckToWaistBack',
  tiro: 'crotchLength',
  altura_cintura: 'waistHeight',
};

export function medidasDeEntrada(e: EntradaDeCatalogo): BodyMeasurements {
  const m: Partial<Record<keyof BodyMeasurements, number>> = {};
  for (const [clave, valor] of Object.entries(e.medidas)) m[CLAVES[clave]] = valor;
  return m as BodyMeasurements;
}

const GRUPOS: Record<string, string> = { mujer: 'Mujer', hombre: 'Hombre', nina: 'Niña', nino: 'Niño' };

/** Como el `nombre()` del generador: "Mujer EU 38 · US 8", "Niña 8 años". */
export function nombreDeTalla(e: EntradaDeCatalogo): string {
  const grupo = GRUPOS[e.grupo] ?? e.grupo;
  return e.talla.edad !== undefined ? `${grupo} ${e.talla.edad} años` : `${grupo} EU ${e.talla.eu} · US ${e.talla.us}`;
}

export const urlDeModelo = (e: EntradaDeCatalogo): string => `/avatares/${e.archivo}`;

/** Un objeto por talla, construido una vez: los selectores de Redux comparan por referencia. */
const POR_URL = new Map<string, Avatar>(CATALOGO.map((e) => [urlDeModelo(e), {
  id: e.id, name: nombreDeTalla(e), modelUrl: urlDeModelo(e), measurements: medidasDeEntrada(e),
}]));

export function avatarPorUrl(url: string | null | undefined): Avatar | undefined {
  return url ? POR_URL.get(url) : undefined;
}

/** Un proyecto nuevo arranca con Mujer EU 38 (spec § 5). */
export const AVATAR_POR_DEFECTO: Avatar = POR_URL.get('/avatares/mujer-eu38.glb')!;
```

- [ ] **Paso 4: verla pasar**

Correr: `npx vitest run src/avatares/__tests__/catalogo.test.ts`
Esperado: PASS, 7 de 7.

Correr: `npx tsc -b --noEmit`
Esperado: sale sin errores. El JSON importado es asignable a `readonly EntradaDeCatalogo[]`.

- [ ] **Paso 5: commit**

```bash
git add tsconfig.app.json src/avatares/catalogo.ts src/avatares/__tests__/catalogo.test.ts
git commit -m "feat(avatares): el catálogo entra a la app, con sus medidas en las claves de Vina"
```

---

### Tarea 2: `MeshoptDecoder` en los dos `GLTFLoader`

**Archivos:**
- Modificar: `src/utils/import/meshImporter.ts:11` (import) y `:217` (`loadGLTF`)
- Modificar: `src/utils/avatar/vrmLoader.ts:7` (import) y `:27` (`loadVRM`)
- Prueba: `src/utils/import/__tests__/meshImporter.meshopt.test.ts`
- Prueba: `tests/repo/cargadores-gltf-meshopt.test.ts`

**Interfaces:**
- Consume: `importMesh(url, filename, options?)` de `meshImporter.ts` (sin cambios de firma).
- Produce: cada `GLTFLoader` de `src/` decodifica `EXT_meshopt_compression`.

- [ ] **Paso 1: las pruebas que fallan**

`src/utils/import/__tests__/meshImporter.meshopt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { importMesh } from '../meshImporter';

/** Una GLB de un triángulo, comprimida como las de la biblioteca (`generar-todas.mjs`). */
async function glbConMeshopt(): Promise<string> {
  const doc = new Document();
  const buf = doc.createBuffer();
  const posiciones = doc.createAccessor().setType('VEC3').setBuffer(buf)
    .setArray(new Float32Array([0, 0, 0, 0.5, 0, 0, 0, 1.7, 0]));
  const indices = doc.createAccessor().setType('SCALAR').setBuffer(buf).setArray(new Uint16Array([0, 1, 2]));
  const prim = doc.createPrimitive().setAttribute('POSITION', posiciones).setIndices(indices);
  doc.createScene().addChild(doc.createNode('cuerpo').setMesh(doc.createMesh().addPrimitive(prim)));
  await MeshoptEncoder.ready;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const glb = await io.writeBinary(doc);
  return `data:model/gltf-binary;base64,${Buffer.from(glb).toString('base64')}`;
}

describe('importMesh con meshopt', () => {
  it('abre una GLB comprimida con meshopt, como las de la biblioteca', async () => {
    const r = await importMesh(await glbConMeshopt(), 'cuerpo.glb');
    let vertices = 0;
    r.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) vertices += (o as THREE.Mesh).geometry.attributes.position.count; });
    expect(vertices).toBe(3);
  });
});
```

`tests/repo/cargadores-gltf-meshopt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Las avatares vienen comprimidas con meshopt (spec § 4.3): un GLTFLoader sin el decodificador
 *  revienta al abrirlas. Todo archivo de src/ que crea uno le registra MeshoptDecoder. */
describe('cargadores GLTF', () => {
  it('cada GLTFLoader de src/ decodifica meshopt', () => {
    const archivos = execFileSync('git', ['grep', '-l', 'new GLTFLoader(', '--', 'src'], { encoding: 'utf8' })
      .trim().split('\n').filter((f) => f && !f.includes('__tests__'));
    expect(archivos.length).toBeGreaterThanOrEqual(2);
    const sinDecodificador = archivos.filter((f) => !readFileSync(f, 'utf8').includes('setMeshoptDecoder(MeshoptDecoder)'));
    expect(sinDecodificador).toEqual([]);
  });
});
```

- [ ] **Paso 2: verlas fallar**

Correr: `npx vitest run src/utils/import/__tests__/meshImporter.meshopt.test.ts tests/repo/cargadores-gltf-meshopt.test.ts`
Esperado:
- la primera falla con `THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files`;
- la segunda falla con `sinDecodificador` = `["src/utils/avatar/vrmLoader.ts", "src/utils/import/meshImporter.ts"]`.

Si la primera falla por otra cosa (por ejemplo, `importMesh` pide DOM en el entorno node), la prueba no mide lo que dice. En ese caso hay que arreglar la prueba antes de seguir.

- [ ] **Paso 3: el código mínimo**

`src/utils/import/meshImporter.ts`, debajo del import de `GLTFLoader` (línea 11):

```ts
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
```

y en `loadGLTF` (línea 217):

```ts
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
```

`src/utils/avatar/vrmLoader.ts`, junto al import de `GLTFLoader`:

```ts
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
```

y en `loadVRM` (línea 27):

```ts
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
```

- [ ] **Paso 4: verlas pasar**

Correr: `npx vitest run src/utils/import/__tests__/meshImporter.meshopt.test.ts tests/repo/cargadores-gltf-meshopt.test.ts src/utils/import src/utils/avatar`
Esperado: PASS todo. Las pruebas que ya había de `meshImporter` y `vrmLoader` siguen verdes.

- [ ] **Paso 5: commit**

```bash
git add src/utils/import/meshImporter.ts src/utils/avatar/vrmLoader.ts src/utils/import/__tests__/meshImporter.meshopt.test.ts tests/repo/cargadores-gltf-meshopt.test.ts
git commit -m "feat(avatares): los dos GLTFLoader decodifican meshopt"
```

---

### Tarea 3: el cuerpo de la biblioteca no se estira, y todo se coloca sobre él

**Archivos:**
- Modificar: `src/utils/avatar/morphTargets.ts` (`aMorph`, referencia en `computeMorphWeights`)
- Modificar: `src/avatares/catalogo.ts` (`medidasDelCuerpo`, `referenciaDeMorph`)
- Modificar, para el render:
  - `src/components/Viewport3D/AvatarModel.tsx:7` y `:178` (selector), `:496-507` (morph);
  - `src/components/Viewport3D/Viewport3D.tsx:195`, `:244-248`, `:260`, `:278`, `:872` y `:884`.
- Modificar, para la colisión:
  - `src/utils/cloth/avatarMeshExtractor.ts:282-287` (`applyMorph` con referencia);
  - `src/utils/cloth/avatarCollisionMesh.ts:16-43` (pasa la referencia);
  - `src/components/Viewport3D/useSimulationLifecycle.ts:318-320` y `:896-907`;
  - `src/components/Viewport3D/ClothMesh.tsx:242`.
- Modificar, para la colocación:
  - `src/components/Viewport3D/GarmentSimulation.tsx:258`;
  - `src/components/Viewport3D/useAvatarTape.ts:80`;
  - `src/store/autoSewThunk.ts:47`;
  - `src/copilot/action/tools/definitions/3dInteractionTools.ts:529` y `:574`;
  - `src/copilot/action/tools/definitions/simulationTools.ts:555` y `:644`;
  - `src/hooks/useKeyboardShortcuts.ts:206` y `:219`.
- Prueba: `src/utils/avatar/__tests__/morphTargets.test.ts` (casos nuevos)
- Prueba: `src/avatares/__tests__/cuerpo.test.ts`
- Prueba: `src/utils/cloth/__tests__/applyMorph.referencia.test.ts`
- Prueba: `tests/repo/cuerpo-de-la-biblioteca.test.ts`

**Interfaces:**
- Consume: de la Tarea 1, `avatarPorUrl(url): Avatar | undefined`, que da una referencia estable.
- Produce:
  - `aMorph(m: BodyMeasurements): MorphConfig`;
  - `computeMorphWeights(measurements: MorphConfig, referencia: MorphConfig = DEFAULT_MEASUREMENTS): MorphWeights`;
  - `medidasDelCuerpo(p: { avatarMode: string; avatarModelUrl: string | null; avatar: Avatar }): BodyMeasurements`, que devuelve referencias estables: el objeto del catálogo o `p.avatar.measurements`;
  - `referenciaDeMorph(url: string | null): MorphConfig`;
  - `applyMorph(scene, measurements, morphTargets, referencia: MorphConfig = DEFAULT_MEASUREMENTS)`;
  - `extractAvatarCollisionMesh(avatarUrl, avatarHeight, joints?, measurements?, morphTargets?, referencia?)`.

- [ ] **Paso 1: las pruebas que fallan**

Agregar al final de `src/utils/avatar/__tests__/morphTargets.test.ts` (y agregar `aMorph` al import de `../morphTargets`):

```ts
describe('estirar contra la referencia del cuerpo cargado (spec § 5)', () => {
  const eu38 = { chest: 88, waist: 77.1, hip: 97, shoulderWidth: 36.1, height: 161.4, armLength: 53.7, inseam: 77.7 };

  it('un cuerpo medido contra sí mismo no se estira: todo da 1,0', () => {
    expect(Object.values(computeMorphWeights(eu38, eu38))).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('sin referencia, sigue comparando contra el hombre de 180 cm', () => {
    expect(computeMorphWeights(eu38).chestScale).toBeCloseTo(88 / 96);
  });

  it('aMorph renombra las claves de BodyMeasurements a las del morph', () => {
    expect(aMorph({ height: 161.4, chest: 88, waist: 77.1, hips: 97, shoulder: 36.1, armLength: 53.7, inseam: 77.7, neckCirc: 31.6 }))
      .toEqual(eu38);
  });
});
```

`src/avatares/__tests__/cuerpo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AVATAR_POR_DEFECTO, avatarPorUrl, medidasDelCuerpo, referenciaDeMorph } from '../catalogo';
import { DEFAULT_MEASUREMENTS, aMorph, computeMorphWeights } from '../../utils/avatar/morphTargets';
import type { BodyMeasurements } from '../../types/types';

const editadas: BodyMeasurements = { height: 170, chest: 70, waist: 60, hips: 80, shoulder: 40, armLength: 60, inseam: 80 };
const proyecto = (avatarModelUrl: string | null, avatarMode = 'model') =>
  ({ avatarMode, avatarModelUrl, avatar: { ...AVATAR_POR_DEFECTO, measurements: editadas } });

describe('las medidas del cuerpo que se ve', () => {
  it('con un cuerpo de la biblioteca son las de su talla, aunque María edite las del proyecto', () => {
    expect(medidasDelCuerpo(proyecto('/avatares/mujer-eu38.glb'))).toBe(AVATAR_POR_DEFECTO.measurements);
    expect(medidasDelCuerpo(proyecto('/avatares/hombre-eu50.glb')).height).toBe(174.4);
  });

  it('con un modelo propio, sin modelo o con el maniquí de costura son las del proyecto, como hoy', () => {
    for (const p of [proyecto('blob:http://localhost/1'), proyecto(null), proyecto('/avatares/mujer-eu38.glb', 'dressform')]) {
      expect(medidasDelCuerpo(p)).toBe(editadas);
    }
  });

  it('un cuerpo de la biblioteca se estira contra sí mismo; un modelo propio, contra el de 180 cm', () => {
    const url = '/avatares/mujer-eu38.glb';
    const w = computeMorphWeights(aMorph(medidasDelCuerpo(proyecto(url))), referenciaDeMorph(url));
    expect(Object.values(w)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    expect(referenciaDeMorph('blob:http://localhost/1')).toBe(DEFAULT_MEASUREMENTS);
    expect(referenciaDeMorph(null)).toBe(DEFAULT_MEASUREMENTS);
    expect(referenciaDeMorph(url)).toEqual(aMorph(avatarPorUrl(url)!.measurements));
  });
});
```

`src/utils/cloth/__tests__/applyMorph.referencia.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { applyMorph } from '../avatarMeshExtractor';

const eu38 = { chest: 88, waist: 77.1, hip: 97, shoulderWidth: 36.1, height: 161.4, armLength: 53.7, inseam: 77.7 };

function esqueleto(): THREE.Group {
  const g = new THREE.Group();
  for (const nombre of ['Hips', 'Spine', 'Spine1', 'LeftShoulder', 'LeftArm', 'LeftUpLeg']) {
    const b = new THREE.Bone();
    b.name = nombre;
    g.add(b);
  }
  return g;
}

const escalas = (g: THREE.Object3D) => {
  const out: Record<string, number[]> = {};
  g.traverse((o) => { if ((o as THREE.Bone).isBone) out[o.name] = o.scale.toArray(); });
  return out;
};

describe('applyMorph (colisión por URL) con la referencia del cuerpo', () => {
  it('un cuerpo de la biblioteca medido contra sí mismo deja todos los huesos en escala 1', () => {
    const g = esqueleto();
    applyMorph(g, eu38, {}, eu38);
    expect(Object.values(escalas(g)).flat().every((s) => s === 1)).toBe(true);
  });

  it('sin referencia, estira como hoy contra el hombre de 180 cm', () => {
    const g = esqueleto();
    applyMorph(g, eu38, {});
    expect(escalas(g).Spine1[0]).toBeCloseTo(88 / 96);
  });
});
```

`tests/repo/cuerpo-de-la-biblioteca.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Un cuerpo de la biblioteca no se estira (spec § 5): lo que se dibuja, choca o se coloca sobre
 * él tiene que leer SUS medidas (`medidasDelCuerpo`), no las del proyecto, que ahora son las del
 * patrón. Si uno de estos archivos vuelve a leer `avatar.measurements`, la colocación se separa
 * del cuerpo en cuanto María edita una medida: piezas sembradas por dentro o flotando.
 */
const LECTORES_DEL_CUERPO = [
  'src/components/Viewport3D/AvatarModel.tsx',
  'src/components/Viewport3D/Viewport3D.tsx',
  'src/components/Viewport3D/GarmentSimulation.tsx',
  'src/components/Viewport3D/useSimulationLifecycle.ts',
  'src/components/Viewport3D/useAvatarTape.ts',
  'src/components/Viewport3D/ClothMesh.tsx',
  'src/store/autoSewThunk.ts',
  'src/copilot/action/tools/definitions/3dInteractionTools.ts',
  'src/copilot/action/tools/definitions/simulationTools.ts',
  'src/hooks/useKeyboardShortcuts.ts',
];

describe('lo que va sobre el cuerpo lee las medidas del cuerpo', () => {
  it.each(LECTORES_DEL_CUERPO)('%s', (archivo) => {
    const src = readFileSync(archivo, 'utf8');
    expect(src).toContain('medidasDelCuerpo');
    expect(src.match(/avatar\.measurements/g) ?? []).toEqual([]);
  });
});
```

- [ ] **Paso 2: verlas fallar**

Correr: `npx vitest run src/utils/avatar/__tests__/morphTargets.test.ts src/avatares/__tests__/cuerpo.test.ts src/utils/cloth/__tests__/applyMorph.referencia.test.ts tests/repo/cuerpo-de-la-biblioteca.test.ts`
Esperado: FAIL.
- `aMorph` y `medidasDelCuerpo` no existen: `is not a function` / `does not provide an export`.
- `applyMorph` ignora la referencia: `Spine1` sale en `0.9166…`, no en 1.
- La prueba de repo falla en los 10 archivos.

- [ ] **Paso 3: el morph contra una referencia**

`src/utils/avatar/morphTargets.ts`:

```ts
import type { BodyMeasurements } from '../../types/types';
```

arriba del archivo, y `computeMorphWeights` queda así:

```ts
/**
 * Compute bone-scale multipliers from body measurements.
 * Each weight is a ratio against `referencia`: the loaded body's own measurements
 * (a library body → all 1.0, spec 2026-09-29 § 5) or, for a user-uploaded model,
 * the default reference avatar.
 */
export function computeMorphWeights(measurements: MorphConfig, referencia: MorphConfig = DEFAULT_MEASUREMENTS): MorphWeights {
  const d = referencia;

  return {
    chestScale: measurements.chest / d.chest,
    waistScale: measurements.waist / d.waist,
    hipScale: measurements.hip / d.hip,
    shoulderScale: measurements.shoulderWidth / d.shoulderWidth,
    heightScale: measurements.height / d.height,
    armLength: (measurements.armLength ?? d.armLength!) / d.armLength!,
    legLength: (measurements.inseam ?? d.inseam!) / d.inseam!,
  };
}

/** `BodyMeasurements` → `MorphConfig` (hip←hips, shoulderWidth←shoulder). */
export function aMorph(m: BodyMeasurements): MorphConfig {
  return {
    chest: m.chest, waist: m.waist, hip: m.hips, shoulderWidth: m.shoulder,
    height: m.height, armLength: m.armLength, inseam: m.inseam,
  };
}
```

- [ ] **Paso 4: las dos funciones del cuerpo en `catalogo.ts`**

Agregar a `src/avatares/catalogo.ts`:

```ts
import { DEFAULT_MEASUREMENTS, aMorph, type MorphConfig } from '../utils/avatar/morphTargets';
```

(junto a los otros imports) y al final:

```ts
/**
 * Las medidas del cuerpo que se ve en 3D. Uno de la biblioteca no se estira (spec § 5): son las de
 * su talla aunque María edite las del proyecto, que van al patrón. Un modelo propio y el maniquí de
 * costura siguen las del proyecto, como antes. Lo que dibuja, choca o se coloca sobre el cuerpo lee
 * de aquí; el patrón lee `project.avatar.measurements`.
 */
export function medidasDelCuerpo(p: { avatarMode: string; avatarModelUrl: string | null; avatar: Avatar }): BodyMeasurements {
  return (p.avatarMode === 'model' && avatarPorUrl(p.avatarModelUrl)?.measurements) || p.avatar.measurements;
}

/** Contra qué se estira el cuerpo cargado: uno de la biblioteca, contra sus propias medidas (todo da
 *  1,0); un modelo propio, contra el hombre de 180 cm de siempre. */
export function referenciaDeMorph(url: string | null): MorphConfig {
  const cuerpo = avatarPorUrl(url);
  return cuerpo ? aMorph(cuerpo.measurements) : DEFAULT_MEASUREMENTS;
}
```

- [ ] **Paso 5: el render**

`src/components/Viewport3D/AvatarModel.tsx`: el import de la línea 7 pasa a

```ts
import { computeMorphWeights, aMorph } from '../../utils/avatar/morphTargets';
import { medidasDelCuerpo, referenciaDeMorph } from '../../avatares/catalogo';
```

Hay que mantener cualquier otro nombre que esa línea ya importe (por ejemplo `type MorphConfig`), menos los que queden sin uso.

El selector de la línea 178 pasa a

```ts
  const measurements = useSelector((s: RootState) => medidasDelCuerpo(s.project));
```

y en `applyPose.current` (líneas 496-507) el bloque `morphCfg` + `computeMorphWeights(morphCfg)` pasa a

```ts
    const weights = computeMorphWeights(aMorph(measurements), referenciaDeMorph(url));
```

`src/components/Viewport3D/Viewport3D.tsx`:
- agregar `import { medidasDelCuerpo } from '../../avatares/catalogo';`;
- debajo de la línea 195 (el `useSelector` de `s.project`):

```ts
  // Lo que se coloca sobre el cuerpo usa SUS medidas: uno de la biblioteca no se estira (spec § 5).
  const cuerpo = medidasDelCuerpo({ avatarMode, avatarModelUrl, avatar });
```

- reemplazar `avatar.measurements` por `cuerpo` en las líneas 244, 248, 260, 278 y 884;
- en la 872, `height={cmToM(cuerpo.height)}`.

- [ ] **Paso 6: la colisión**

`src/utils/cloth/avatarMeshExtractor.ts`:
- en el import de `computeMorphWeights` (línea 12), agregar `DEFAULT_MEASUREMENTS`;
- `applyMorph` (282-287) pasa a:

```ts
export function applyMorph(
  scene: THREE.Object3D,
  measurements: MorphConfig,
  morphTargets: Record<string, number>,
  referencia: MorphConfig = DEFAULT_MEASUREMENTS,
): void {
  const w = computeMorphWeights(measurements, referencia);
```

`src/utils/cloth/avatarCollisionMesh.ts`: en la firma, después de `morphTargets?: Record<string, number>,`:

```ts
  referencia?: import('../avatar/morphTargets').MorphConfig,
```

y la línea 43:

```ts
  if (measurements) applyMorph(result.scene, measurements, morphTargets ?? {}, referencia);
```

`src/components/Viewport3D/useSimulationLifecycle.ts`:
- agregar `import { medidasDelCuerpo, referenciaDeMorph } from '../../avatares/catalogo';` y `import { aMorph } from '../../utils/avatar/morphTargets';`;
- las líneas 318 y 320 pasan a:

```ts
  const measurements = useSelector((s: RootState) => medidasDelCuerpo(s.project));
  const avatarHeight = cmToM(measurements.height);
```

(se borra la 320 vieja; `measurements` queda declarado antes de `avatarHeight`).
- el bloque de las líneas 896-907 pasa a:

```ts
        // #frente2 collision fix: the collider gets the same morph as the render
        // (AvatarModel.tsx): the body's own measurements against its own reference.
        const morphCfg = aMorph(measurements);
        // Live bake first (reads the CURRENT morphed render — no arg plumbing);
        // URL pipeline with explicit morphs as fallback.
        const collisionMesh = (await bakeCollisionFromRender())
          ?? await extractAvatarCollisionMesh(avatarModelUrl, avatarHeight, avatarJointsRef.current, morphCfg, morphTargets, referenciaDeMorph(avatarModelUrl));
```

`src/components/Viewport3D/ClothMesh.tsx:242`:

```ts
  const avatarHeight = cmToM(useSelector((s: RootState) => medidasDelCuerpo(s.project).height));
```

con `import { medidasDelCuerpo } from '../../avatares/catalogo';`.

- [ ] **Paso 7: la colocación**

Cada archivo importa `medidasDelCuerpo` de `../../avatares/catalogo` o de la ruta relativa que le toque:
- `src/copilot/action/tools/definitions/` → `'../../../../avatares/catalogo'`;
- `src/store/` y `src/hooks/` → `'../avatares/catalogo'`.

- `GarmentSimulation.tsx:258`: `const avatarMeasurements = useSelector((s: RootState) => medidasDelCuerpo(s.project));`
- `useAvatarTape.ts:80`: `const measurements = useSelector((s: RootState) => medidasDelCuerpo(s.project));`
- `autoSewThunk.ts:47`: `medidasDelCuerpo(state.project),`
- `3dInteractionTools.ts:529` y `:574`: `placeGarmentPieces(pieces, medidasDelCuerpo(state.project))`
- `simulationTools.ts:555`: `buildAnchorMap(mesh, medidasDelCuerpo(state.project), { left: armAxis.left, right: armAxis.right })`
- `simulationTools.ts:644`: `const measurements = medidasDelCuerpo(state.project);`
- `useKeyboardShortcuts.ts`:
  - junto al `avatar` de la línea 69: `const cuerpo = useSelector((s: RootState) => medidasDelCuerpo(s.project));`;
  - en 206 y 219: `placeGarmentPieces(pieces, cuerpo)`;
  - en el arreglo de dependencias de la línea 303, agregar `cuerpo`. Si `avatar` queda sin uso en todo el archivo, se borra su selector y se saca de las dependencias.

Antes de editar cada archivo, `grep -n "avatar\.measurements"` en él. Si aparece en una línea que no está en esta lista, hay que leerla:
- si coloca o dibuja algo sobre el cuerpo, se cambia igual;
- si es del patrón, se deja y el archivo sale de `LECTORES_DEL_CUERPO` con un `Ruling:`.

- [ ] **Paso 8: verlas pasar**

Correr: `npx vitest run src/utils/avatar src/avatares src/utils/cloth/__tests__/applyMorph.referencia.test.ts tests/repo/cuerpo-de-la-biblioteca.test.ts`
Esperado: PASS todo.

Correr: `npx tsc -b --noEmit`
Esperado: sale sin errores.

Correr: `npm run test > .tmp/suite-t3.log 2>&1; tail -30 .tmp/suite-t3.log`
Esperado: los mismos fallos que main, si los hay, y ninguno nuevo. Los mocks de estado sin `avatarModelUrl` caen en las medidas del proyecto (`avatarPorUrl(undefined)` → `undefined`).

- [ ] **Paso 9: commit**

```bash
git add src/utils/avatar/morphTargets.ts src/avatares/catalogo.ts src/components/Viewport3D/AvatarModel.tsx src/components/Viewport3D/Viewport3D.tsx src/utils/cloth/avatarMeshExtractor.ts src/utils/cloth/avatarCollisionMesh.ts src/components/Viewport3D/useSimulationLifecycle.ts src/components/Viewport3D/ClothMesh.tsx src/components/Viewport3D/GarmentSimulation.tsx src/components/Viewport3D/useAvatarTape.ts src/store/autoSewThunk.ts src/copilot/action/tools/definitions/3dInteractionTools.ts src/copilot/action/tools/definitions/simulationTools.ts src/hooks/useKeyboardShortcuts.ts src/utils/avatar/__tests__/morphTargets.test.ts src/avatares/__tests__/cuerpo.test.ts src/utils/cloth/__tests__/applyMorph.referencia.test.ts tests/repo/cuerpo-de-la-biblioteca.test.ts
git commit -m "feat(avatares): el cuerpo de la biblioteca no se estira y todo se coloca sobre él"
```

---

### Tarea 4: guardar y reabrir conserva el cuerpo

**Archivos:**
- Modificar: `src/store/projectSlice.ts:283` (`applyProjectPayload`)
- Prueba: `src/store/__tests__/projectSlice.avatarAlCargar.test.ts`

**Interfaces:**
- Consume: de la Tarea 1, `avatarPorUrl` y `AVATAR_POR_DEFECTO`.
- Produce: después de `loadProject` o `restoreProject`, `state.avatarModelUrl === state.avatar.modelUrl`, y siempre es una URL de la biblioteca.

- [ ] **Paso 1: la prueba que falla**

`src/store/__tests__/projectSlice.avatarAlCargar.test.ts`:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import reducer, { loadProject, restoreProject, setAvatarModelUrl } from '../projectSlice';
import type { VinaProject } from '../../types/types';

const medidas = { height: 180, chest: 96, waist: 82, hips: 96, shoulder: 44, armLength: 64, inseam: 82 };
const proyecto = (modelUrl: string): VinaProject => ({
  id: 'p', name: 'Guardado', pieces: [], seams: [], fabrics: [],
  avatar: { id: 'a', name: 'A', modelUrl, measurements: medidas },
  createdAt: 1000, updatedAt: 1000,
} as any);

// Estado de partida con un modelo propio cargado: al abrir otro proyecto no puede quedar pegado.
const conModeloPropio = reducer(reducer(undefined, { type: '@@INIT' }), setAvatarModelUrl('blob:http://localhost/propio'));

describe('al cargar, el cuerpo sale de avatar.modelUrl (spec § 5)', () => {
  it.each([['loadProject', loadProject], ['restoreProject', restoreProject]] as const)('%s restaura una talla de la biblioteca', (_, accion) => {
    const s = reducer(conModeloPropio, accion(proyecto('/avatares/hombre-eu50.glb')));
    expect(s.avatarModelUrl).toBe('/avatares/hombre-eu50.glb');
    expect(s.avatar.modelUrl).toBe('/avatares/hombre-eu50.glb');
  });

  it.each(['', '/default-avatar.glb', 'blob:http://localhost/viejo'])(
    'un proyecto sin cuerpo de la biblioteca (%j) abre con Mujer EU 38 y conserva sus medidas',
    (modelUrl) => {
      const s = reducer(conModeloPropio, restoreProject(proyecto(modelUrl)));
      expect(s.avatarModelUrl).toBe('/avatares/mujer-eu38.glb');
      expect(s.avatar.modelUrl).toBe('/avatares/mujer-eu38.glb');
      expect(s.avatar.measurements).toEqual(medidas);
    },
  );
});
```

- [ ] **Paso 2: verla fallar**

Correr: `npx vitest run src/store/__tests__/projectSlice.avatarAlCargar.test.ts`
Esperado: FAIL. `avatarModelUrl` se queda en `'blob:http://localhost/propio'`, porque `applyProjectPayload` no lo toca.

- [ ] **Paso 3: el código mínimo**

En `src/store/projectSlice.ts`:
- agregar `import { AVATAR_POR_DEFECTO, avatarPorUrl } from '../avatares/catalogo';`;
- la línea 283 (`state.avatar = p.avatar;`) pasa a:

```ts
  // El cuerpo viaja en avatar.modelUrl (spec 2026-09-29 § 5). Uno que no es de la
  // biblioteca —proyectos de antes ('' o el escaneo borrado) o un modelo propio,
  // cuyo blob ya no existe al reabrir— vuelve a la talla por defecto; las medidas
  // del proyecto se quedan: son las del patrón.
  const modelUrl = avatarPorUrl(p.avatar.modelUrl)?.modelUrl ?? AVATAR_POR_DEFECTO.modelUrl;
  state.avatar = { ...p.avatar, modelUrl };
  state.avatarModelUrl = modelUrl;
```

- [ ] **Paso 4: verla pasar**

Correr: `npx vitest run src/store/__tests__/projectSlice.avatarAlCargar.test.ts src/store/__tests__/projectSlice.restore.test.ts src/store/__tests__/projectAutosave.test.ts`
Esperado: PASS todo.

- [ ] **Paso 5: commit**

```bash
git add src/store/projectSlice.ts src/store/__tests__/projectSlice.avatarAlCargar.test.ts
git commit -m "feat(avatares): al abrir un proyecto, el cuerpo sale de avatar.modelUrl"
```

---

### Tarea 5: Mujer EU 38 por defecto, el panel lo dice y se borra el escaneo

**Archivos:**
- Modificar: `src/store/projectSlice.ts:165-178` (`defaultAvatar`) y `:248` (`avatarModelUrl`)
- Modificar: `src/components/Viewport3D/AvatarPanel.tsx:12-14`, `:108-113`, `:226-238` y el grupo de medidas (`:282`)
- Borrar: `public/default-avatar.glb` (`git rm`)
- Modificar, las referencias viejas:
  - `scripts/avatares/generar-todas.mjs:37` y `scripts/avatares/generar.py:44` (comentarios);
  - `src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx:133` (comentario);
  - `src/store/__tests__/projectStateSerialization.test.ts:123` (fixture).
- Crear: `tests/e2e/avatar-por-defecto.spec.ts`
- Modificar: `scripts/deploy-prod.sh` (lista de e2e)
- Prueba: `src/store/__tests__/projectSlice.avatarAlCargar.test.ts` (caso nuevo)

**Interfaces:**
- Consume: `AVATAR_POR_DEFECTO` y `avatarPorUrl` (Tarea 1); `medidasDelCuerpo` (Tarea 3).
- Produce: estado inicial y `NEW_PROJECT` con `avatar === AVATAR_POR_DEFECTO` y `avatarModelUrl === '/avatares/mujer-eu38.glb'`.

- [ ] **Paso 1: las pruebas que fallan**

Agregar a `src/store/__tests__/projectSlice.avatarAlCargar.test.ts`:

```ts
import { NEW_PROJECT } from '../actions';
import { AVATAR_POR_DEFECTO } from '../../avatares/catalogo';

describe('proyecto nuevo', () => {
  it('arranca con Mujer EU 38 y sus medidas, al abrir la app y con Nuevo proyecto', () => {
    for (const s of [reducer(undefined, { type: '@@INIT' }), reducer(conModeloPropio, NEW_PROJECT())]) {
      expect(s.avatar).toBe(AVATAR_POR_DEFECTO);
      expect(s.avatarModelUrl).toBe('/avatares/mujer-eu38.glb');
    }
  });
});
```

(`NEW_PROJECT` es un `createAction` de `src/store/actions.ts`; si su firma pide payload, hay que llamarla como la llaman sus pruebas).

`tests/e2e/avatar-por-defecto.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { abrirPanel } from './helpers/estados';

interface VentanaConStore {
  __VINA_STORE__?: { getState: () => { simulation: { armAxis: { ready: boolean } }; project: { avatarModelUrl: string } } };
}

/** Spec 2026-09-29 § 5 y § 9: un proyecto nuevo pide mujer-eu38.glb y nunca default-avatar.glb. */
test('un proyecto nuevo abre con Mujer EU 38, comprimida con meshopt, y el panel dice qué cuerpo es', async ({ page }) => {
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(new URL(r.url()).pathname));
  const errores: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  await page.goto('/app/');
  // El esqueleto se leyó: AvatarModel despacha armAxis.ready al encontrar los huesos,
  // y eso solo pasa si la GLB comprimida se decodificó.
  await page.waitForFunction(
    () => (window as unknown as VentanaConStore).__VINA_STORE__?.getState().simulation.armAxis.ready === true,
    null, { timeout: 45_000 },
  );
  expect(await page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__!.getState().project.avatarModelUrl))
    .toBe('/avatares/mujer-eu38.glb');
  expect(pedidos).toContain('/avatares/mujer-eu38.glb');
  expect(pedidos.filter((p) => p.includes('default-avatar'))).toEqual([]);
  expect(errores.filter((e) => /meshopt|GLTFLoader|AvatarModel/i.test(e))).toEqual([]);

  await abrirPanel(page, 'Avatar y medidas', 'Avatar');
  await expect(page.getByText('Mujer EU 38 · US 8', { exact: true })).toBeVisible();
  await expect(page.getByText('El cuerpo es la talla Mujer EU 38 · US 8; tus cambios se usan en el patrón.')).toBeVisible();
});
```

- [ ] **Paso 2: verlas fallar**

Correr: `npx vitest run src/store/__tests__/projectSlice.avatarAlCargar.test.ts`
Esperado: FAIL en "proyecto nuevo", con `avatarModelUrl` = `'/default-avatar.glb'`.

Antes del e2e, verificar el puerto: `curl -s http://localhost:5174/app/ | grep -o "<title>[^<]*"` tiene que decir Vina. Si no hay nada escuchando, Playwright levanta su propio Vite.

Correr: `npx playwright test tests/e2e/avatar-por-defecto.spec.ts --workers=1 --retries=0`
Esperado: FAIL. `avatarModelUrl` es `/default-avatar.glb`, o el waitForFunction pasa pero `pedidos` no contiene `/avatares/mujer-eu38.glb`.

- [ ] **Paso 3: el defecto**

En `src/store/projectSlice.ts`:
- se borra la constante `defaultAvatar` (líneas 165-178);
- en `initialState`, `avatar: defaultAvatar,` pasa a `avatar: AVATAR_POR_DEFECTO,`;
- `avatarModelUrl: '/default-avatar.glb',` pasa a `avatarModelUrl: AVATAR_POR_DEFECTO.modelUrl,`.

Si `defaultAvatar` se usa en otro lugar del archivo (`grep -n defaultAvatar`), ahí también pasa a `AVATAR_POR_DEFECTO`.

- [ ] **Paso 4: el panel** (antes de escribirlo, releer la skill `contrato-de-interfaz`)

`src/components/Viewport3D/AvatarPanel.tsx`:
- agregar `import { AVATAR_POR_DEFECTO, avatarPorUrl } from '../../avatares/catalogo';`;
- debajo del selector de `avatarModelUrl` (línea 60):

```ts
  const modeloDelProyecto = useSelector((s: RootState) => s.project.avatar.modelUrl);
  // El cuerpo que se ve, si es de la biblioteca: no se estira (spec § 5).
  const deLaBiblioteca = avatarPorUrl(avatarModelUrl);
```

- el efecto "Derive model name" (108-113):

```ts
  useEffect(() => {
    if (!avatarModelUrl || avatarPorUrl(avatarModelUrl)) {
      setModelName(null);
    }
  }, [avatarModelUrl]);
```

- el bloque `ap-model-info` (226-238):

```tsx
                <div className="ap-model-info">
                  <span>{modelName ?? deLaBiblioteca?.name ?? 'Modelo propio'}</span>
                  {!deLaBiblioteca && (
                    <button
                      className="ap-btn"
                      style={{ flex: 'none', padding: '2px 8px' }}
                      onClick={() => {
                        dispatch(setAvatarModelUrl(avatarPorUrl(modeloDelProyecto)?.modelUrl ?? AVATAR_POR_DEFECTO.modelUrl));
                        setModelName(null);
                      }}
                    >
                      Restablecer
                    </button>
                  )}
                </div>
```

- justo antes de `{/* Measurements */}`:

```tsx
                {avatarMode === 'model' && deLaBiblioteca && (
                  <div className="ap-hint">El cuerpo es la talla {deLaBiblioteca.name}; tus cambios se usan en el patrón.</div>
                )}
```

- [ ] **Paso 5: borrar el escaneo y las referencias viejas**

```bash
git rm public/default-avatar.glb
```

- `scripts/avatares/generar-todas.mjs:37`: el comentario pasa a `// los 52 de Mixamo, sin el prefijo mixamorig:`.
- `scripts/avatares/generar.py:44`: el comentario pasa a `# los 52 de Mixamo, sin el prefijo mixamorig:`.
- `useSimulationLifecycle.seamInit.test.tsx:133`: `'/default-avatar.glb'` pasa a `'/avatares/mujer-eu38.glb'` en el comentario.
- `projectStateSerialization.test.ts:123`: `avatarModelUrl: '/avatares/mujer-eu38.glb',`.

Correr: `git grep -n "default-avatar" -- ':!docs'`
Esperado: nada.

- [ ] **Paso 6: verlas pasar, y la suite completa**

Correr: `npx vitest run src/store/__tests__/projectSlice.avatarAlCargar.test.ts`
Esperado: PASS.

Correr: `npm run test > .tmp/suite-t5.log 2>&1; grep -E "Test Files|Tests " .tmp/suite-t5.log; grep -E "FAIL|✗|×" .tmp/suite-t5.log | head -40`
Esperado: es probable que caigan pruebas que traían escritas las medidas viejas del avatar por defecto (180/96/82/96/44/64/82). Por cada una, leer qué promete:
- si promete "el valor por defecto": el esperado pasa a las medidas de Mujer EU 38;
- si promete algo sobre un cálculo y usaba el defecto por comodidad: la prueba fija sus propias medidas con `updateMeasurements` o un estado armado. No se cambia el número esperado para que pase.

Un fallo que no sea de medidas es un bug y se depura (skill `systematic-debugging`).

Correr: `npx playwright test tests/e2e/avatar-por-defecto.spec.ts --workers=1 --retries=0`
Esperado: PASS.

- [ ] **Paso 7: el e2e entra al gate de deploy**

En `scripts/deploy-prod.sh`, en la lista de `npx playwright test --workers=2`, después de `tests/e2e/supr-con-algo-delante.spec.ts \`:

```bash
  tests/e2e/avatar-por-defecto.spec.ts \
```

Correr: `bash -n scripts/deploy-prod.sh && grep -c "avatar-por-defecto" scripts/deploy-prod.sh`
Esperado: `1`, y el archivo tiene los mismos finales de línea que antes (`git diff --stat` muestra 1 línea agregada).

- [ ] **Paso 8: commit**

```bash
git add src/store/projectSlice.ts src/components/Viewport3D/AvatarPanel.tsx scripts/avatares/generar-todas.mjs scripts/avatares/generar.py src/components/Viewport3D/__tests__/useSimulationLifecycle.seamInit.test.tsx src/store/__tests__/projectStateSerialization.test.ts src/store/__tests__/projectSlice.avatarAlCargar.test.ts tests/e2e/avatar-por-defecto.spec.ts scripts/deploy-prod.sh
git commit -m "feat(avatares): un proyecto nuevo arranca con Mujer EU 38 y se borra el escaneo de Samuel"
```

(`git rm` ya dejó el borrado en el índice. Las pruebas que se ajustaron en el paso 6 se agregan por ruta en este mismo commit.)

---

### Tarea 6: gates, e2e del deploy, trinquetes y PR

**Archivos:** ninguno nuevo. Si un contador del contrato de UI baja, se actualiza `scripts/ui-contract-baseline.json` con `--update`.

- [ ] **Paso 1: los gates**

Correr: `npx tsc -b --noEmit && npm run test > .tmp/suite-final.log 2>&1; echo "exit $?"; grep -E "Test Files|Tests " .tmp/suite-final.log`
Esperado: `exit 0`, sin fallos.

Correr: `npm run lint && npm run lint:ui`
Esperado: 0 errores, 0 warnings nuevos y el trinquete en verde.

- [ ] **Paso 2: la lista e2e del deploy**

Verificar el puerto, como en la Tarea 5. Después, correr la lista de `scripts/deploy-prod.sh` a mano: el script no tiene modo solo-gates.

```bash
sed -n '/npx playwright test --workers=2/,/> \/tmp\/vina-deploy-e2e.log/p' scripts/deploy-prod.sh | grep -o "tests/e2e/[^ ]*" > .tmp/lista-e2e.txt
npx playwright test --workers=2 $(cat .tmp/lista-e2e.txt) > .tmp/e2e-deploy.log 2>&1; grep -E "passed|failed|flaky" .tmp/e2e-deploy.log
```

Esperado: todos pasan, sin flaky, y la cuenta sube en uno respecto de la corrida anterior.

- [ ] **Paso 3: los trinquetes en navegador**

```bash
npx playwright test tests/e2e/superficies-por-accion.spec.ts tests/e2e/contraste-del-cromo.spec.ts --retries=0 --workers=1
```

Esperado: en verde. La nota del panel usa `--text-secondary` sobre el fondo del panel, igual que las otras `.ap-hint`.

- [ ] **Paso 4: mirarlo**

Con `npm run dev`, abrir `/app/` y tomar capturas del 3D y del panel Avatar. Hay que comprobar tres cosas:
- el cuerpo es la EU 38 gris A con cabeza de maniquí;
- subir la estatura y bajar el pecho no cambian el cuerpo;
- el panel dice la talla y la nota.

- [ ] **Paso 5: la PR**

Push de `feat/avatares-integracion` y PR contra main. El cuerpo lleva:
- qué trae;
- los desvíos del spec (la sección de este plan);
- la verificación con comandos y números;
- lo que falta: la galería, § 6.

Al final va `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. El merge y el deploy los decide Samuel.
