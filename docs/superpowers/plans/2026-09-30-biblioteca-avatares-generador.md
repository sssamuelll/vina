# Biblioteca de avatares, paso 1: el generador — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que `npm run avatares` genere las 31 avatares de la biblioteca a partir de ANSUR II y NHANES. De cada una salen un GLB comprimido, una miniatura y una entrada de catálogo, y del conjunto una hoja de contactos para revisarlas.

**Arquitectura:** `tallas.mjs` (Node) convierte los datos públicos en `tallas.json` con las medidas objetivo de cada talla. `generar.py` corre en Blender sin interfaz, un proceso por avatar: crea el cuerpo con MPFB, carga el acabado de maniquí, ajusta las medidas (`ajuste.py`), hornea el rig Mixamo, mide las 15 (`medir.py`) y exporta. `generar-todas.mjs` lanza esos procesos en paralelo, comprime con meshopt, escribe el catálogo y arma la hoja de contactos.

**Tecnología:** Blender 5.0.1 y MPFB 2.0.17 (Python dentro de Blender, trae numpy), Node 22 con ESM, `@gltf-transform/{core,extensions,functions}` 4.5 más `meshoptimizer` 1.3, Playwright (ya instalado) para capturar la hoja y vitest.

**Spec:** `docs/superpowers/specs/2026-09-29-biblioteca-de-avatares-design.md` (Samuel lo aprobó el 2026-09-30). Este plan cubre el paso 1 de su § 8. La integración con la app (§ 5) y la galería (§ 6, que espera al contrato de interfaz v2) van en planes aparte.

**Todo el código de este plan ya corrió.** Se prototipó el 2026-09-30 en una copia fuera del repo:
- las 31 tallas convergen;
- pasan las 16 pruebas de vitest y las 3 suites de Blender;
- cada prueba falló a propósito al menos una vez con una mutación del código que vigila.

Los valores que aparecen en los pasos "Esperado" salen de esas corridas.

## Global Constraints

- Blender 5.0 y MPFB 2.0.17 van fijados, y `generar.py` aborta si alguna versión no coincide. Para instalar MPFB: `blender --online-mode -c extension install -s -e mpfb`.
- Toda llamada a Blender lleva `-b --python-exit-code 1`. Sin esa bandera, una excepción de Python sale con código 0.
- Cada medida ajustada queda a ≤ 0,5 cm de su objetivo, o esa talla falla (§ 3.4). El catálogo publica lo que mide la malla terminada, no lo que se pidió.
- Las avatares llevan los 52 huesos Mixamo sin el prefijo `mixamorig:`, los mismos del avatar de hoy.
- El color es gris A: una textura plana de 4×4 en sRGB 0,72. Va en textura porque la app pone el color del material en blanco (`AvatarModel.tsx:662`).
- Licencia: los números salen de ANSUR II y NHANES, ambos de dominio público. Nunca se dice "conforme a ASTM". La app dirá "Medidas calculadas a partir de ANSUR II" (o NHANES).
- Los datos crudos no se commitean: van a `.tmp/avatares-datos/`, que está en el gitignore. `tallas.json` sí se commitea.
- **Nada generado entra al repo sin que Samuel lo apruebe viendo la hoja de contactos.** Eso incluye GLB, miniaturas, `catalogo.json` y los `.target` del acabado. Hasta la Tarea 9 solo se commitea código.
- El generador nunca corre en el servidor ni en el deploy.
- Los commits van con rutas explícitas, nunca con `git add -A`. En la raíz hay un `.maria-avatar.mjs` sin trackear que no es parte de esto. Mensajes en español, estilo `feat(avatares): …`, y al final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sin `--no-verify`. El hook de pre-commit corre `tsc -b`, lint-staged y el trinquete de UI; el de pre-push corre la suite completa.
- IDs: `mujer-eu38`, `hombre-eu50`, `nina-8`, `nino-8`. Sin ñ en los nombres de archivo.
- Rama: `feat/biblioteca-avatares` (PR #1224). El spec, el plan y el generador viajan juntos.

## Desvíos del spec

Medidos el 2026-09-30. Samuel los revisa junto con el plan.

1. **Cuello.** Se ajusta a la columna `neckcircumference` de ANSUR: bajo la nuez y perpendicular al cuello, que es la medida de cuello de camisa. No se usa la base del cuello. Razón: el lazo de cuello de MakeHuman pasa por ahí, y con `neckcircumferencebase` (34–39 cm en mujeres) ninguna mujer llega, porque el target de cuello alcanza como máximo 33,8.
2. **Cintura.** ANSUR mide la cintura a la altura del ombligo. NHANES la mide sobre la cresta ilíaca, que en adultos queda a 0,4–1,5 cm del ombligo (medido en ANSUR). El generador ajusta a esa altura; el campo se llama `cintura_ombligo` y solo aparece en `tallas.json` y en el informe. El catálogo publica la **cintura natural** (ver la enmienda de abajo).
3. **Niños.** NHANES 2021–2023 tiene tres limitaciones:
   - la cadera solo existe desde los 12 años (es lo que dice la documentación de la variable);
   - no trae muslo;
   - su "largo de brazo" es solo el brazo superior.

   Por eso los niños ajustan estatura y cintura, y cadera solo a los 12 y 14. El resto se mide y se publica.
4. **Talla US de mujer = EU − 30**, así que EU 38 = US 8, como en el ejemplo de § 3.1. La tabla de § 2 dice "US 0–18", pero eso no cuadra ni con 9 tallas ni con el ejemplo; queda US 2–18. En hombre, US = EU − 10 (EU 50 = US 40).
5. **La cabeza lisa no se esculpe: se reemplaza** (ver la Tarea 8, reescrita). Por script se probaron tres alisados de la cabeza original y ninguno sirve:
   - Taubin deja la cara casi igual;
   - el laplaciano encoge la cabeza hacia el cuello;
   - el alisado radial la vuelve una bola con rasgos fantasma.

   Pezones y entrepierna sí salen por script (manera 1). La cabeza la teje `cabeza.py`, entera y nueva, en cada avatar.
6. **La palanca gruesa es el macro `weight`**, y los targets `measure-*` llegan hasta ±2. Con los targets limitados a ±1, las tallas grandes no llegan: a EU 48 le faltaban 10 cm de cintura.
7. **meshopt va con las librerías de gltf-transform**, no con su CLI. Así se llama desde el mismo proceso y entran menos paquetes. Las dos rutas instalan `sharp`, porque lo pide `@gltf-transform/functions`.
8. **`npm run avatares` tarda unos 2 min, no unos 6.** Corren 8 Blender a la vez y cada talla tarda de 5 a 15 s.

### Enmienda de la revisión final (2026-09-30)

La revisión de toda la rama encontró que tres medidas publicadas no se medían donde las pone ISO 8559-1 (§ 3.2 del spec). Se corrigieron con pruebas en `ajuste_test.py` (`donde_mide`), sobre cuerpos reales, calibrando contra ANSUR con 12 cuerpos ajustados:

- **Muslo:** horizontal, en la pierna izquierda, a 0,012 de la estatura bajo la horcajadura (el pliegue glúteo). El lazo de MakeHuman quedaba 7 cm más abajo: EU 38 publicaba 55,4 y ahora 57,5 (ANSUR: 58,0). Si a esa altura las piernas se tocan, falla en vez de medir las dos.
- **Talle trasero:** arranca en la cervical, el punto medio de los vértices 857 y 858, a ≤ 1,1 cm de la mediana de `cervicaleheight` de ANSUR en seis tallas adultas. Antes arrancaba a media altura del cuello, 4 cm más arriba.
- **Cintura natural:** va horizontal y a altura fija, a media altura entre la cresta ilíaca y la costilla más baja (protocolo de la OMS; ISO 8559-1 la ubica entre ambas). Eso es 0,12 del tramo entre el lazo del ombligo y el bajo busto, calibrado con `iliocristaleheight` y `tenthribheight` de ANSUR. No es la mínima: en la malla de mujer la mínima caía por encima de la costilla más baja, y el torso de hombre es una meseta que la hacía saltar de talla a talla. EU 38: queda a 101,5 cm (ANSUR: 101,2) y mide 77,1. EN 13402 dice 69–72, porque las mujeres de ANSUR son más anchas de cintura que esa tabla: su cintura al ombligo mide 79,1.

También `generar-todas.mjs` comprime y valida en `.tmp/` antes de copiar a `public/`. Así, una talla rechazada no pisa la GLB publicada, y un error posterior a Blender sale como FALLA de esa talla en vez de tumbar la corrida.

## Review Focus

1. **Blender falla y el orquestador lo da por bueno.** Sin `--python-exit-code 1`, una excepción dentro de Blender sale con código 0. Además, un archivo de una corrida anterior puede pasar por nuevo. Lo esperado: la talla sale como FALLA con la cola del log, su entrada del catálogo no se toca y el proceso termina con exit 1. Lo prueba la Tarea 6, paso 9.
2. **ANSUR responde 200 con su página HTML en vez del CSV** (pasó el 2026-09-30). Lo esperado: un error de sha256 que dice qué borrar y reintentar, nunca tallas calculadas sobre HTML. Lo prueba la Tarea 1 (`avatares-tallas.test.ts`).
3. **`--solo` borra las demás tallas del catálogo.** Lo esperado: se reemplazan solo las pedidas y el resto se conserva, en el orden de `tallas.json`. Lo prueba la Tarea 6 (`mezclarCatalogo`).
4. **Una estatura objetivo pegada a la neutra cae en la zona muerta del macro `height`** (0,49–0,51) y el ajuste se queda sin gradiente. Le pasó a `hombre-eu48`. Lo esperado: converge. Lo prueba la Tarea 3 (`macro_real`). La prueba de convergencia sola no reproduce el caso; está medido.
5. **Hornear cambia el orden o la posición de los vértices** y los índices de `medir.py` miden otro punto sin que nadie se entere. Lo esperado: `generar.py` falla si no quedan exactamente 13380 vértices o si alguno se movió más de 0,1 mm. Lo prueban la Tarea 2 (`solo_mide_el_cuerpo_de_mpfb`) y la guarda de `hornear()` en la Tarea 5.

## Mapa de archivos

| Archivo | Qué hace |
|---|---|
| `scripts/avatares/tallas.mjs` | ANSUR II + NHANES → `tallas.json` (sha256, CSV, XPT, bandas, medianas) |
| `scripts/avatares/tallas.json` | las 31 tallas con sus medidas objetivo y la columna y banda de donde sale cada una |
| `scripts/avatares/medir.py` | las 15 medidas sobre la malla (la cinta es la envolvente convexa del corte) |
| `scripts/avatares/ajuste.py` | lleva un cuerpo MPFB a sus medidas objetivo |
| `scripts/avatares/acabado.py` | los `.target` del acabado de maniquí (pezones y entrepierna) |
| `scripts/avatares/cabeza.py` | la cabeza de maniquí: reemplaza la de MPFB por una tapa lisa, después de medir |
| `scripts/avatares/generar.py` | una avatar por proceso de Blender: GLB, miniatura, hoja y entrada |
| `scripts/avatares/generar-todas.mjs` | `npm run avatares`: paralelo, meshopt, catálogo, hoja de contactos y `--probar` |
| `scripts/avatares/{medir,ajuste,acabado}_test.py` | las pruebas que corren dentro de Blender |
| `tests/repo/avatares-{tallas,generar}.test.ts` | las pruebas de vitest de los dos scripts de Node |
| `tests/fixtures/avatares/bmx_l_primeras20.xpt` | las 20 primeras filas de NHANES BMX_L (7360 bytes) |
| `scripts/avatares/acabado/<grupo>/*.target` | el acabado; se commitea en la Tarea 9, después de la aprobación |
| `public/avatares/<id>.{glb,webp}`, `src/avatares/catalogo.json` | la salida; se commitea en la Tarea 9, después de la aprobación |

En los comandos, `$BLENDER` es `"C:/Program Files/Blender Foundation/Blender 5.0/blender.exe"`. En Git Bash se define con `BLENDER="C:/Program Files/Blender Foundation/Blender 5.0/blender.exe"`. `generar-todas.mjs` lee la misma variable.

---

### Task 1: Las tallas desde los datos públicos

**Files:**
- Create: `scripts/avatares/tallas.mjs`, `scripts/avatares/tallas.json` (lo genera el script)
- Create: `tests/fixtures/avatares/bmx_l_primeras20.xpt`
- Test: `tests/repo/avatares-tallas.test.ts`

**Interfaces:**
- Produces: `scripts/avatares/tallas.json` = `{ generadoPor, fuentes, tallas: Talla[] }` con `Talla = { id, grupo: 'mujer'|'hombre'|'nina'|'nino', talla: {eu, us} | {edad}, fuente: 'ANSUR II'|'NHANES 2021-2023', n, banda, columnas, objetivo: { estatura, cintura_ombligo, … } }`. Los adultos traen 8 medidas en `objetivo`: `estatura, busto, cintura_ombligo, cadera, cuello, hombros, largo_brazo, entrepierna`. Los niños traen `estatura, cintura_ombligo` y, a los 12 y 14, también `cadera`. Todo en cm con un decimal.
- Exports de `tallas.mjs` (para las pruebas): `mediana`, `leerCsv`, `ibmADoble`, `leerXpt`, `tallaAdulta(filas, grupo, eu)`, `tallaNino(bmx, demo, grupo, edad)`, `generarTallas`, `descargar(nombre, {url, sha256}, dir)`, `FUENTES`, `COLUMNAS_ANSUR`, `COLUMNAS_NHANES`.

- [ ] **Step 1: Crear el fixture de NHANES (20 filas, sin red en las pruebas)**

```bash
mkdir -p tests/fixtures/avatares
curl -sL "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BMX_L.xpt" | head -c 7360 > tests/fixtures/avatares/bmx_l_primeras20.xpt
sha256sum tests/fixtures/avatares/bmx_l_primeras20.xpt
```
Esperado: `5847de798be262095a439621be1e90260c65eb7562a4d1d81f03f763992038a3`. Esos 7360 bytes son la cabecera del XPT (3840 bytes) más 20 filas de 176 bytes cada una.

- [ ] **Step 2: Escribir la prueba que falla**

`tests/repo/avatares-tallas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// @ts-expect-error — módulo .mjs sin tipos
import { mediana, leerCsv, ibmADoble, leerXpt, tallaAdulta, tallaNino, descargar } from '../../scripts/avatares/tallas.mjs';

const ibm = (hex: string) => ibmADoble(Buffer.from(hex, 'hex'), 0);

describe('tallas: lectura de los datos', () => {
  it('mediana impar y par', () => {
    expect(mediana([3, 1, 2])).toBe(2);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(() => mediana([])).toThrow();
  });

  it('número IBM 370 de SAS → double; los faltantes de SAS (., _, .A…) son null', () => {
    expect(ibm('4110000000000000')).toBe(1);
    expect(ibm('4264000000000000')).toBe(100);
    expect(ibm('c128000000000000')).toBe(-2.5);
    expect(ibm('0000000000000000')).toBe(0);
    expect(ibm('2e00000000000000')).toBeNull();
    expect(ibm('5f00000000000000')).toBeNull();
    expect(ibm('4100000000000000')).toBeNull();
  });

  it('lee el XPT de NHANES igual que pandas (20 primeras filas de BMX_L)', () => {
    const { variables, filas } = leerXpt(readFileSync('tests/fixtures/avatares/bmx_l_primeras20.xpt'));
    expect(variables).toHaveLength(22);
    expect(filas).toHaveLength(20);
    expect(filas.slice(0, 5).map((f: Record<string, number | null>) => [f.SEQN, f.BMXHT, f.BMXWAIST, f.BMXHIP])).toEqual([
      [130378, 179.5, 98.3, 102.9], [130379, 174.2, 114.7, 112.4], [130380, 152.9, 93.5, 98],
      [130381, 120.1, 70.4, null], [130382, null, null, null],
    ]);
    expect(filas[19]).toMatchObject({ SEQN: 130400, BMXHT: 160.3, BMXWAIST: 97, BMXHIP: 101 });
  });

  it('CSV de ANSUR: CRLF, claves en minúscula, y una fila con campos de más es un error', () => {
    expect(leerCsv('SubjectId,Stature\r\n1,1600\r\n2,1700\r\n')).toEqual([{ subjectid: '1', stature: '1600' }, { subjectid: '2', stature: '1700' }]);
    expect(() => leerCsv('a,b\r\n1,2,3\r\n')).toThrow(/fila 2/);
  });

  it('un archivo que no es el esperado (el HTML que a veces manda ANSUR) no pasa el sha256', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'tallas-'));
    writeFileSync(path.join(dir, 'ANSUR_II_FEMALE_Public.csv'), '<!DOCTYPE html><html></html>');
    await expect(descargar('ansurMujer', { url: 'https://invalido.example/ANSUR_II_FEMALE_Public.csv', sha256: '0'.repeat(64) }, dir))
      .rejects.toThrow(/se esperaba 0{64}.*Borra/s);
  });
});

const persona = (chestMm: number, extra: Record<string, number> = {}) => ({
  chestcircumference: String(chestMm), stature: '1600', waistcircumference: '800', buttockcircumference: '1000',
  neckcircumference: '320', biacromialbreadth: '360', sleeveoutseam: '540', crotchheight: '780',
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
});

describe('tallas: una talla adulta', () => {
  it('la banda de busto es [centro − 2, centro + 2) y el resto es la mediana de esa banda', () => {
    const filas = [
      ...Array.from({ length: 9 }, () => persona(870)),
      persona(860, { stature: 1705 }), // borde de abajo: entra
      persona(859, { stature: 1 }), persona(900, { stature: 1 }), // fuera: 85,9 y el borde de arriba
    ];
    const t = tallaAdulta(filas, 'mujer', 38);
    expect(t).toMatchObject({ id: 'mujer-eu38', grupo: 'mujer', talla: { eu: '38', us: '8' }, fuente: 'ANSUR II', n: 10 });
    expect(t.objetivo).toEqual({ estatura: 160, busto: 88, cintura_ombligo: 80, cadera: 100, cuello: 32, hombros: 36, largo_brazo: 54, entrepierna: 78 });
  });

  it('una mediana par que cae en medio milímetro se redondea hacia arriba', () => {
    const filas = [...Array.from({ length: 5 }, () => persona(1000, { stature: 1700 })), ...Array.from({ length: 5 }, () => persona(1000, { stature: 1701 }))];
    expect(tallaAdulta(filas, 'hombre', 50).objetivo.estatura).toBe(170.1);
    expect(tallaAdulta(filas, 'hombre', 50).talla).toEqual({ eu: '50', us: '40' });
  });

  it('una banda con menos de 10 personas es un error que nombra la talla', () => {
    expect(() => tallaAdulta([persona(870)], 'mujer', 38)).toThrow(/mujer EU 38: 1 personas en la banda de busto 86–90 cm/);
  });
});

describe('tallas: una talla de niña o niño', () => {
  const demo = [
    ...Array.from({ length: 10 }, (_, i) => ({ SEQN: i, RIAGENDR: 2, RIDAGEYR: 8 })),
    { SEQN: 100, RIAGENDR: 1, RIDAGEYR: 8 }, // niño: no cuenta para niña
    { SEQN: 101, RIAGENDR: 2, RIDAGEYR: 9 }, // 9 años: no cuenta para 8
  ];
  const bmx = [
    ...Array.from({ length: 10 }, (_, i) => ({ SEQN: i, BMXHT: 130 + i * 0.1, BMXWAIST: 60, BMXHIP: null })),
    { SEQN: 100, BMXHT: 999, BMXWAIST: 999, BMXHIP: 999 },
    { SEQN: 101, BMXHT: 999, BMXWAIST: 999, BMXHIP: 999 },
  ];

  it('solo esa edad cumplida y ese sexo; sin cadera cuando NHANES no la midió', () => {
    const t = tallaNino(bmx, demo, 'nina', 8);
    expect(t).toMatchObject({ id: 'nina-8', talla: { edad: 8 }, fuente: 'NHANES 2021-2023', n: 10 });
    expect(t.objetivo).toEqual({ estatura: 130.5, cintura_ombligo: 60 }); // mediana de 130,0…130,9
    expect(t.columnas).toEqual({ estatura: 'BMXHT', cintura_ombligo: 'BMXWAIST' });
  });
});

describe('tallas.json commiteado', () => {
  const { tallas } = JSON.parse(readFileSync('scripts/avatares/tallas.json', 'utf8'));
  const ids = tallas.map((t: { id: string }) => t.id);

  it('las 31 en orden: mujer, hombre, niña, niño', () => {
    expect(ids).toEqual([
      ...[32, 34, 36, 38, 40, 42, 44, 46, 48].map((eu) => `mujer-eu${eu}`),
      ...[44, 46, 48, 50, 52, 54, 56, 58].map((eu) => `hombre-eu${eu}`),
      ...[2, 4, 6, 8, 10, 12, 14].map((e) => `nina-${e}`),
      ...[2, 4, 6, 8, 10, 12, 14].map((e) => `nino-${e}`),
    ]);
  });

  it('valores contrastados con pandas el 2026-09-30', () => {
    const t = Object.fromEntries(tallas.map((x: { id: string }) => [x.id, x]));
    expect(t['mujer-eu38']).toMatchObject({ n: 318, objetivo: { estatura: 161.4, busto: 88, cintura_ombligo: 79.1, cadera: 97, cuello: 31.6, hombros: 36.1, largo_brazo: 53.7, entrepierna: 77.7 } });
    expect(t['hombre-eu58']).toMatchObject({ n: 400, objetivo: { estatura: 177.8, cintura_ombligo: 105.4, cuello: 41.9 } });
    expect(t['nina-8']).toMatchObject({ n: 80, objetivo: { estatura: 131.8, cintura_ombligo: 62.8 } });
    expect(t['nino-14'].objetivo).toEqual({ estatura: 170.5, cintura_ombligo: 80.3, cadera: 93.4 });
  });

  it('cadera solo desde los 12 años (NHANES no la mide antes)', () => {
    for (const t of tallas.filter((x: { grupo: string }) => x.grupo === 'nina' || x.grupo === 'nino')) {
      expect('cadera' in t.objetivo).toBe(t.talla.edad >= 12);
    }
  });
});
```

- [ ] **Step 3: Correrla y verla fallar**

Run: `npx vitest run tests/repo/avatares-tallas.test.ts`
Esperado: FAIL, porque no encuentra `scripts/avatares/tallas.mjs`.

- [ ] **Step 4: Escribir `scripts/avatares/tallas.mjs`**

```js
/**
 * ANSUR II + NHANES → scripts/avatares/tallas.json: las 31 tallas con sus medidas objetivo.
 * Spec: docs/superpowers/specs/2026-09-29-biblioteca-de-avatares-design.md § 3 y § 4.1.
 *
 *   node scripts/avatares/tallas.mjs
 *
 * Los datos crudos se descargan a .tmp/avatares-datos/ (gitignored) y se verifica el sha256
 * de cada archivo: el servidor de ANSUR a veces responde 200 con la página HTML en vez del CSV.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const FUENTES = {
  ansurMujer: { url: 'https://tools.openlab.psu.edu/publicData/ANSUR_II_FEMALE_Public.csv', sha256: 'ed7e800aa97a4d42f8286b988be2fe1883a2e789588169db959864b707d1757a' },
  ansurHombre: { url: 'https://tools.openlab.psu.edu/publicData/ANSUR_II_MALE_Public.csv', sha256: '0547aea0170e5293de519389981135e75803f02e6d40c77ace740decc0caac64' },
  nhanesBmx: { url: 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/BMX_L.xpt', sha256: '44440c416d9ad709e8b1708a5975378ab4d5b18edc39eb5015c2ae7186500170' },
  nhanesDemo: { url: 'https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/DEMO_L.xpt', sha256: 'ca4374a158b493b8b0163e1388da21d57a18d1b9cecff2aa4e2fa2bec494fe23' },
};

// ANSUR II mide en mm. cintura_ombligo: ANSUR mide la cintura a la altura del ombligo (omphalion),
// no en la cintura natural; el generador la ajusta a esa altura y publica aparte la natural.
export const COLUMNAS_ANSUR = {
  estatura: 'stature', busto: 'chestcircumference', cintura_ombligo: 'waistcircumference',
  cadera: 'buttockcircumference', cuello: 'neckcircumference', hombros: 'biacromialbreadth',
  largo_brazo: 'sleeveoutseam', entrepierna: 'crotchheight',
};
// NHANES mide en cm. BMXHIP solo existe desde los 12 años (target de la variable en BMX_L).
export const COLUMNAS_NHANES = { estatura: 'BMXHT', cintura_ombligo: 'BMXWAIST', cadera: 'BMXHIP' };

const MIN_PERSONAS = 10; // la banda más chica de verdad (mujer EU 32) tiene 10 (2026-09-30)
// Los datos vienen en décimos de cm (ANSUR en mm; NHANES con un decimal): la mediana se redondea ahí,
// en enteros, para que el .json no dependa de la coma flotante.
const cm = (decimos) => Math.round(mediana(decimos)) / 10;

export function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) throw new Error('mediana de una lista vacía');
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** CSV sin comillas (ANSUR II no las usa): filas como objetos con claves en minúscula. */
export function leerCsv(texto) {
  const [cab, ...filas] = texto.split(/\r?\n/).filter((l) => l.length);
  const cols = cab.split(',').map((c) => c.toLowerCase());
  return filas.map((l, i) => {
    const celdas = l.split(',');
    if (celdas.length !== cols.length) throw new Error(`fila ${i + 2}: ${celdas.length} campos, se esperaban ${cols.length}`);
    return Object.fromEntries(cols.map((c, j) => [c, celdas[j]]));
  });
}

/** Número IBM 370 de 8 bytes (el de SAS XPORT) → double. null si es un valor faltante de SAS. */
export function ibmADoble(b, i) {
  const b0 = b[i];
  let resto = 0;
  for (let k = 1; k < 8; k++) resto |= b[i + k];
  if (resto === 0 && (b0 === 0x2e || b0 === 0x5f || (b0 >= 0x41 && b0 <= 0x5a))) return null;
  const alto = (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3];
  const bajo = ((b[i + 4] << 24) >>> 0) + (b[i + 5] << 16) + (b[i + 6] << 8) + b[i + 7];
  const fraccion = (alto * 2 ** 32 + bajo) / 2 ** 56;
  const v = fraccion * 16 ** ((b0 & 0x7f) - 64);
  return b0 & 0x80 ? -v : v;
}

/** SAS XPORT v5 (el formato de NHANES), un solo miembro: { variables, filas }. */
export function leerXpt(buf) {
  const txt = (a, n) => buf.toString('latin1', a, a + n);
  if (!txt(0, 48).startsWith('HEADER RECORD*******LIBRARY HEADER RECORD!!!!!!!')) throw new Error('no es SAS XPORT v5');
  const iNames = buf.indexOf('HEADER RECORD*******NAMESTR HEADER RECORD!!!!!!!', 0, 'latin1');
  const nVars = Number(txt(iNames + 54, 4));
  const variables = [];
  for (let k = 0; k < nVars; k++) {
    const a = iNames + 80 + k * 140;
    variables.push({ tipo: buf.readUInt16BE(a), largo: buf.readUInt16BE(a + 4), nombre: txt(a + 8, 8).trim(), pos: buf.readUInt32BE(a + 84) });
  }
  const iObs = buf.indexOf('HEADER RECORD*******OBS     HEADER RECORD!!!!!!!', iNames, 'latin1');
  const largoFila = variables.reduce((s, v) => Math.max(s, v.pos + v.largo), 0);
  const filas = [];
  for (let a = iObs + 80; a + largoFila <= buf.length; a += largoFila) {
    if (buf.subarray(a, a + largoFila).every((x) => x === 0x20)) break; // relleno del último registro
    filas.push(Object.fromEntries(variables.map((v) => [v.nombre,
      v.tipo === 1 ? ibmADoble(buf, a + v.pos) : txt(a + v.pos, v.largo).trim()])));
  }
  return { variables: variables.map((v) => v.nombre), filas };
}

const ADULTOS = {
  mujer: { filas: 'ansurMujer', eus: [32, 34, 36, 38, 40, 42, 44, 46, 48], busto: (eu) => 2 * eu + 12, us: (eu) => eu - 30 },
  hombre: { filas: 'ansurHombre', eus: [44, 46, 48, 50, 52, 54, 56, 58], busto: (eu) => 2 * eu, us: (eu) => eu - 10 },
};
const NINOS = { nina: 2, nino: 1 }; // RIAGENDR de NHANES: 1 hombre, 2 mujer
const EDADES = [2, 4, 6, 8, 10, 12, 14];

/** Una talla adulta: la banda de busto [centro − 2, centro + 2) fija quién entra; el resto es su mediana. */
export function tallaAdulta(filas, grupo, eu) {
  const { busto, us } = ADULTOS[grupo];
  const centro = busto(eu);
  const banda = filas.filter((f) => { const mm = Number(f.chestcircumference); return mm >= (centro - 2) * 10 && mm < (centro + 2) * 10; });
  if (banda.length < MIN_PERSONAS) throw new Error(`${grupo} EU ${eu}: ${banda.length} personas en la banda de busto ${centro - 2}–${centro + 2} cm`);
  const objetivo = Object.fromEntries(Object.entries(COLUMNAS_ANSUR).map(([m, col]) =>
    [m, m === 'busto' ? centro : cm(banda.map((f) => Number(f[col])))]));
  return { id: `${grupo}-eu${eu}`, grupo, talla: { eu: String(eu), us: String(us(eu)) }, fuente: 'ANSUR II', n: banda.length,
    banda: { medida: 'busto', columna: 'chestcircumference', desde: centro - 2, hasta: centro + 2 }, columnas: COLUMNAS_ANSUR, objetivo };
}

/** Una talla de niña o niño: las personas de esa edad cumplida y ese sexo; cada medida, si hay datos. */
export function tallaNino(bmx, demo, grupo, edad) {
  const quien = new Set(demo.filter((d) => d.RIAGENDR === NINOS[grupo] && d.RIDAGEYR === edad).map((d) => d.SEQN));
  const banda = bmx.filter((b) => quien.has(b.SEQN));
  if (banda.length < MIN_PERSONAS) throw new Error(`${grupo} ${edad} años: ${banda.length} personas`);
  const objetivo = {};
  const columnas = {};
  for (const [m, col] of Object.entries(COLUMNAS_NHANES)) {
    const v = banda.map((b) => b[col]).filter((x) => x !== null);
    if (v.length >= MIN_PERSONAS) { objetivo[m] = cm(v.map((x) => Math.round(x * 10))); columnas[m] = col; }
  }
  return { id: `${grupo}-${edad}`, grupo, talla: { edad }, fuente: 'NHANES 2021-2023', n: banda.length,
    banda: { medida: 'edad', columna: 'RIDAGEYR', desde: edad, hasta: edad + 1 }, columnas, objetivo };
}

export function generarTallas({ ansurMujer, ansurHombre, bmx, demo }) {
  const ansur = { ansurMujer, ansurHombre };
  return [
    ...Object.entries(ADULTOS).flatMap(([grupo, { filas, eus }]) => eus.map((eu) => tallaAdulta(ansur[filas], grupo, eu))),
    ...Object.keys(NINOS).flatMap((grupo) => EDADES.map((edad) => tallaNino(bmx, demo, grupo, edad))),
  ];
}

export async function descargar(nombre, { url, sha256 }, dir) {
  const ruta = `${dir}/${url.split('/').pop()}`;
  if (!existsSync(ruta)) writeFileSync(ruta, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const buf = readFileSync(ruta);
  const h = createHash('sha256').update(buf).digest('hex');
  if (h !== sha256) throw new Error(`${nombre}: sha256 ${h}, se esperaba ${sha256}. Borra ${ruta} y reintenta; si persiste, la fuente cambió.`);
  return buf;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = '.tmp/avatares-datos';
  mkdirSync(dir, { recursive: true });
  const b = {};
  for (const [k, f] of Object.entries(FUENTES)) b[k] = await descargar(k, f, dir);
  const tallas = generarTallas({
    ansurMujer: leerCsv(b.ansurMujer.toString('latin1')), ansurHombre: leerCsv(b.ansurHombre.toString('latin1')),
    bmx: leerXpt(b.nhanesBmx).filas, demo: leerXpt(b.nhanesDemo).filas,
  });
  const salida = fileURLToPath(new URL('./tallas.json', import.meta.url));
  writeFileSync(salida, JSON.stringify({ generadoPor: 'scripts/avatares/tallas.mjs', fuentes: FUENTES, tallas }, null, 2) + '\n');
  console.log(`${tallas.length} tallas → ${salida}`);
}
```

- [ ] **Step 5: Generar `tallas.json`**

Run: `node scripts/avatares/tallas.mjs`
Esperado: `31 tallas → …\scripts\avatares\tallas.json`. La primera vez baja unos 7 MB a `.tmp/avatares-datos/`. Si sale un error de sha256, borra el archivo que nombra y reintenta: el servidor de ANSUR a veces responde con su HTML.

- [ ] **Step 6: Correr la prueba y verla pasar**

Run: `npx vitest run tests/repo/avatares-tallas.test.ts`
Esperado: 12 passed. Los valores de "tallas.json commiteado" se contrastaron con pandas: `mujer-eu38` da n = 318, estatura 161,4 y cuello 31,6; `nino-14` da cadera 93,4.

- [ ] **Step 7: Commit**

```bash
npx tsc -b --noEmit && npx eslint --max-warnings=0 tests/repo/avatares-tallas.test.ts
git add scripts/avatares/tallas.mjs scripts/avatares/tallas.json tests/repo/avatares-tallas.test.ts tests/fixtures/avatares/bmx_l_primeras20.xpt
git commit -m "$(cat <<'EOF'
feat(avatares): tallas.mjs — las 31 tallas desde ANSUR II y NHANES

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: La cinta — las 15 medidas sobre la malla

**Files:**
- Create: `scripts/avatares/medir.py`
- Test: `scripts/avatares/medir_test.py`
- Modify: `.gitignore` (agregar `__pycache__/`: Python lo crea al importar `medir`)

**Interfaces:**
- Produces (`medir.py`):
  - `N_CUERPO = 13380`, `LAZOS`, `HORIZONTALES`, `ACROMION`, `ACROMION_DER`, `CODO`, `MUNECA`.
  - Primitivas: `cortar(bm, punto, normal) -> [[Vector]]`, `casco(puntos, normal)`, `anillo(bm, punto, normal, cerca, con_casco=False) -> cm | (cm, puntos)`, `plano_de_lazo(co, lazo) -> (centro, normal)`, `cinta(bm, co, nombre, z=None, con_casco=False)`, `recorrido(bm, punto, normal, desde, hasta) -> cm`, `coordenadas(bm)` (falla si la malla no tiene 13380 vértices).
  - Medidas: `medidas_ajustables(bm) -> {estatura, busto, cintura_ombligo, cadera, cuello, hombros, largo_brazo, entrepierna}`, `medidas(bm) -> las 15 del catálogo`, `trazos(bm) -> {nombre: puntos}`.
  - Todas las medidas en cm, sin redondear. `bm` es el cuerpo solo, en metros, con z arriba y -y adelante.

- [ ] **Step 1: Escribir la prueba que falla**

`scripts/avatares/medir_test.py`:

```python
"""La cinta sobre figuras de valor conocido (spec § 9). Corre dentro de Blender:

    blender -b --factory-startup --python-exit-code 1 --python scripts/avatares/medir_test.py
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medir  # noqa: E402

PRUEBAS = []


def prueba(f):
    PRUEBAS.append(f)
    return f


def tubo(bm, r, alto, centro=(0, 0, 0), n=256, anillos=5, giro=Matrix.Identity(3)):
    """Tubo abierto de radio r a lo largo de z (girado por `giro`); devuelve los índices de cada anillo."""
    c = Vector(centro)
    filas = []
    for k in range(anillos):
        z = -alto / 2 + alto * k / (anillos - 1)
        filas.append([bm.verts.new(c + giro @ Vector((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z))) for i in range(n)])
    for a, b in zip(filas, filas[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.verts.index_update()
    return [[v.index for v in f] for f in filas]


def circulo(r, n=256):
    return 2 * n * r * math.sin(math.pi / n) * 100


@prueba
def cilindro_de_radio_10():
    bm = bmesh.new()
    tubo(bm, 0.10, 1.0)
    got = medir.anillo(bm, (0, 0, 0.1), (0, 0, 1), (0, 0, 0.1))
    assert abs(got - 62.83) < 0.05, got


@prueba
def caja_de_30_por_20():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((0.3, 0.2, 1.0, 1.0)))
    got = medir.anillo(bm, (0, 0, 0), (0, 0, 1), (0, 0, 0))
    assert abs(got - 100.0) < 0.01, got


@prueba
def la_cinta_salta_las_concavidades():
    # prisma en L de 30 cm con brazo de 10: la envolvente mide 80 + 20·√2, no los 120 del contorno
    bm = bmesh.new()
    pts = [(0, 0), (0.3, 0), (0.3, 0.1), (0.1, 0.1), (0.1, 0.3), (0, 0.3)]
    abajo = [bm.verts.new((x, y, -0.5)) for x, y in pts]
    arriba = [bm.verts.new((x, y, 0.5)) for x, y in pts]
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((abajo[i], abajo[j], arriba[j], arriba[i]))
    got = medir.anillo(bm, (0, 0, 0), (0, 0, 1), (0.1, 0.1, 0))
    assert abs(got - (80 + 20 * math.sqrt(2))) < 0.01, got


@prueba
def el_brazo_pegado_no_entra_en_el_torso():
    bm = bmesh.new()
    tubo(bm, 0.15, 1.0)
    tubo(bm, 0.04, 1.0, centro=(0.20, 0, 0))
    torso = medir.anillo(bm, (0, 0, 0.1), (0, 0, 1), (0, 0, 0.1))
    brazo = medir.anillo(bm, (0, 0, 0.1), (0, 0, 1), (0.2, 0, 0.1))
    assert abs(torso - circulo(0.15)) < 0.05, torso
    assert abs(brazo - circulo(0.04)) < 0.05, brazo


@prueba
def en_un_miembro_inclinado_la_cinta_sigue_el_lazo():
    bm = bmesh.new()
    anillos = tubo(bm, 0.10, 1.0, giro=Matrix.Rotation(math.radians(30), 3, 'X'))
    co = [v.co.copy() for v in bm.verts]
    centro, normal = medir.plano_de_lazo(co, anillos[2])
    perpendicular = medir.anillo(bm, centro, normal, centro)
    horizontal = medir.anillo(bm, centro, (0, 0, 1), centro)
    assert abs(perpendicular - 62.83) < 0.05, perpendicular
    assert abs(horizontal - 67.78) < 0.1, horizontal  # elipse de semiejes 10 y 10/cos 30°


@prueba
def el_recorrido_va_por_el_camino_corto():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=256, v_segments=128, radius=0.1)
    got = medir.recorrido(bm, (0, 0, 0), (1, 0, 0), (0, 0, 0.1), (0, 0.1, 0))
    assert abs(got - 15.71) < 0.05, got  # un cuarto de circunferencia, no tres


@prueba
def solo_mide_el_cuerpo_de_mpfb():
    bm = bmesh.new()
    tubo(bm, 0.1, 1.0)
    try:
        medir.coordenadas(bm)
    except ValueError as e:
        assert '13380' in str(e), e
    else:
        raise AssertionError('una malla que no es el cuerpo base debería rechazarse')


for f in PRUEBAS:
    f()
    print('ok', f.__name__)
print(f'medir_test: {len(PRUEBAS)} pruebas OK')
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `"$BLENDER" -b --factory-startup --python-exit-code 1 --python scripts/avatares/medir_test.py`
Esperado: exit 1 con `ModuleNotFoundError: No module named 'medir'`. Esta suite no necesita MPFB, por eso lleva `--factory-startup`.

- [ ] **Step 3: Escribir `scripts/avatares/medir.py`**

```python
"""Las 15 medidas sobre la malla del avatar, en cm (spec § 3.2 y § 4.3 paso 7).

Circunferencia = perímetro de la envolvente convexa del corte de la malla con un plano, tomando
solo el anillo más cercano al punto de referencia: así mide una cinta, que salta las concavidades
y no abraza el brazo. Longitud = recorrido sobre la superficie o recta entre puntos de la
superficie, según la medida.

Dónde pasa la cinta lo dicen los lazos de vértices de la malla base hm08, los mismos que usa
MakeHuman para sus targets measure-* (makehuman/plugins/0_modeling_a_measurement.py, clase Ruler;
se toman los índices, que son un dato de la malla, no código de MakeHuman, que es AGPL).
Todos los cuerpos de MPFB comparten esa topología, así que un índice es el mismo punto anatómico
en la mujer EU 48 y en el niño de 2 años. Solo se usan los índices del cuerpo (0..13379): los
ayudantes van después y el modificador de máscara no cambia el orden de los que quedan.

Ejes de MPFB: z arriba, -y adelante, +x a la izquierda del avatar.
"""
import heapq
import math

import bmesh
import mathutils.geometry as G
import numpy as np
from mathutils import Vector

N_CUERPO = 13380

LAZOS = {
    'cuello': [7514, 10358, 7631, 7496, 7488, 7489, 7474, 7475, 7531, 7537, 7543, 7549, 7555, 7561, 7743, 7722, 856, 1030, 1051, 850, 844, 838, 832, 826, 820, 756, 755, 770, 769, 777, 929, 3690, 804, 800, 808, 801, 799, 803, 7513, 7515, 7521, 7514],
    'biceps': [8383, 8393, 8392, 8391, 8390, 8394, 8395, 8399, 10455, 10516, 8396, 8397, 8398, 8388, 8387, 8386, 10431, 8385, 8384, 8389],
    'busto': [8439, 8455, 8462, 8446, 8478, 8494, 8557, 8510, 8526, 8542, 10720, 10601, 10603, 10602, 10612, 10611, 10610, 10613, 10604, 10605, 10606, 3942, 3941, 3940, 3950, 3947, 3948, 3949, 3938, 3939, 3937, 4065, 1870, 1854, 1838, 1885, 1822, 1806, 1774, 1790, 1783, 1767, 1799, 8471],
    'bajo_busto': [10750, 10744, 10724, 10725, 10748, 10722, 10640, 10642, 10641, 10651, 10650, 10649, 10652, 10643, 10644, 10645, 10646, 10647, 10648, 3988, 3987, 3986, 3985, 3984, 3983, 3982, 3992, 3989, 3990, 3991, 3980, 3981, 3979, 4067, 4098, 4073, 4072, 4094, 4100, 4082, 4088, 4088],
    'cintura_ombligo': [4121, 10760, 10757, 10777, 10776, 10779, 10780, 10778, 10781, 10771, 10773, 10772, 10775, 10774, 10814, 10834, 10816, 10817, 10818, 10819, 10820, 10821, 4181, 4180, 4179, 4178, 4177, 4176, 4175, 4196, 4173, 4131, 4132, 4129, 4130, 4128, 4138, 4135, 4137, 4136, 4133, 4134, 4108, 4113, 4118, 4121],
    'cadera': [4341, 10968, 10969, 10971, 10970, 10967, 10928, 10927, 10925, 10926, 10923, 10924, 10868, 10875, 10861, 10862, 4228, 4227, 4226, 4242, 4234, 4294, 4293, 4296, 4295, 4297, 4298, 4342, 4345, 4346, 4344, 4343, 4361, 4341],
    'muslo': [11071, 11080, 11081, 11086, 11076, 11077, 11074, 11075, 11072, 11073, 11069, 11070, 11087, 11085, 11084, 12994, 11083, 11082, 11079, 11071],
    'rodilla': [11223, 11230, 11232, 11233, 11238, 11228, 11229, 11226, 11227, 11224, 11225, 11221, 11222, 11239, 11237, 11236, 13002, 11235, 11234, 11223],
}
# Horizontales como las mide ISO 8559-1 de pie. Cuello y bíceps (el brazo va en A, a unos 45°): la
# cinta sigue el plano del lazo, perpendicular al miembro.
HORIZONTALES = {'busto', 'bajo_busto', 'cintura_ombligo', 'cadera', 'muslo', 'rodilla'}
ACROMION, ACROMION_DER = 8274, 1602  # izquierdo y su espejo (data/mesh_metadata/hm08.mirror)
CODO, MUNECA = 10037, 10548          # MakeHuman: upperarm-length [8274, 10037], lowerarm-length [10040, 10548]
PASO_CINTURA = 0.005                 # m: barrido de la cintura natural


def _cm(m):
    return m * 100.0


def cortar(bm, punto, normal):
    """Anillos del corte de la malla con el plano: lista de listas de puntos (Vector)."""
    bm = bm.copy()
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=punto, plane_no=normal)
    aristas = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    padre = {}

    def raiz(a):
        while padre.setdefault(a, a) != a:
            padre[a] = padre[padre[a]]
            a = padre[a]
        return a
    for e in aristas:
        padre[raiz(e.verts[0].index)] = raiz(e.verts[1].index)
    comps = {}
    for e in aristas:
        for v in e.verts:
            comps.setdefault(raiz(v.index), {})[v.index] = v.co.copy()
    bm.free()
    return [list(c.values()) for c in comps.values()]


def casco(puntos, normal):
    """Los puntos de la envolvente convexa, en orden, vistos sobre el plano de normal `normal`."""
    n = Vector(normal).normalized()
    u = n.orthogonal().normalized()
    v = n.cross(u)
    return [puntos[i] for i in G.convex_hull_2d([(p.dot(u), p.dot(v)) for p in puntos])]


def anillo(bm, punto, normal, cerca, con_casco=False):
    """Circunferencia (cm) del anillo del corte más cercano a `cerca`, como una cinta; con_casco
    devuelve además los puntos de la cinta (para dibujarla)."""
    anillos = [a for a in cortar(bm, punto, normal) if len(a) >= 3]
    if not anillos:
        raise ValueError(f'el plano en {tuple(punto)} no corta la malla')
    mejor = min(anillos, key=lambda a: (sum(a, Vector()) / len(a) - Vector(cerca)).length)
    h = casco(mejor, normal)
    cm = _cm(sum((h[i] - h[i - 1]).length for i in range(len(h))))
    return (cm, h) if con_casco else cm


def plano_de_lazo(co, lazo):
    """Centro y normal del plano que mejor ajusta a los vértices del lazo."""
    pts = np.array([tuple(co[i]) for i in dict.fromkeys(lazo)])
    centro = pts.mean(axis=0)
    normal = np.linalg.svd(pts - centro)[2][2]
    return Vector(centro), Vector(normal).normalized()


def cinta(bm, co, nombre, z=None, con_casco=False):
    """Circunferencia (cm) en el lazo `nombre`; con `z`, horizontal a esa altura."""
    centro, normal = plano_de_lazo(co, LAZOS[nombre])
    if z is not None or nombre in HORIZONTALES:
        punto = Vector((centro.x, centro.y, centro.z if z is None else z))
        return anillo(bm, punto, (0, 0, 1), punto, con_casco)
    return anillo(bm, centro, normal, centro, con_casco)


def recorrido(bm, punto, normal, desde, hasta):
    """Largo (cm) del camino más corto entre dos puntos siguiendo el corte de la malla con el plano."""
    bm = bm.copy()
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=punto, plane_no=normal)
    vecinos = {}
    for e in r['geom_cut']:
        if isinstance(e, bmesh.types.BMEdge):
            a, b = e.verts
            d = (a.co - b.co).length
            vecinos.setdefault(a.index, []).append((b.index, d))
            vecinos.setdefault(b.index, []).append((a.index, d))
    co = {v.index: v.co.copy() for v in bm.verts if v.index in vecinos}
    bm.free()
    ini = min(co, key=lambda i: (co[i] - Vector(desde)).length)
    fin = min(co, key=lambda i: (co[i] - Vector(hasta)).length)
    dist = {ini: 0.0}
    cola = [(0.0, ini)]
    while cola:
        d, i = heapq.heappop(cola)
        if i == fin:
            return _cm(d)
        if d > dist.get(i, math.inf):
            continue
        for j, w in vecinos[i]:
            if d + w < dist.get(j, math.inf):
                dist[j] = d + w
                heapq.heappush(cola, (d + w, j))
    raise ValueError('los puntos no están en el mismo contorno del corte')


def coordenadas(bm):
    bm.verts.ensure_lookup_table()
    if len(bm.verts) != N_CUERPO:
        raise ValueError(f'la malla tiene {len(bm.verts)} vértices; se esperaba solo el cuerpo ({N_CUERPO})')
    return [v.co.copy() for v in bm.verts]


def medidas_ajustables(bm):
    """Las que el generador ajusta a los datos (spec § 3.4); cintura_ombligo es la de ANSUR/NHANES."""
    co = coordenadas(bm)
    z0 = min(c.z for c in co)
    sagital = cortar(bm, (0, 0, 0), (1, 0, 0))
    horcajadura = min((p for a in sagital for p in a), key=lambda p: p.z)
    return {
        'estatura': _cm(max(c.z for c in co) - z0),
        'busto': cinta(bm, co, 'busto'),
        'cintura_ombligo': cinta(bm, co, 'cintura_ombligo'),
        'cadera': cinta(bm, co, 'cadera'),
        'cuello': cinta(bm, co, 'cuello'),
        'hombros': _cm((co[ACROMION] - co[ACROMION_DER]).length),
        'largo_brazo': _cm((co[ACROMION] - co[CODO]).length + (co[CODO] - co[MUNECA]).length),
        'entrepierna': _cm(horcajadura.z - z0),
    }


def cintura_natural(bm, co):
    """La circunferencia horizontal mínima entre el lazo de la cintura (ombligo) y el bajo busto."""
    z_ombligo = plano_de_lazo(co, LAZOS['cintura_ombligo'])[0].z
    z_bajo = plano_de_lazo(co, LAZOS['bajo_busto'])[0].z
    alturas = [z_ombligo + k * PASO_CINTURA for k in range(int((z_bajo - z_ombligo) / PASO_CINTURA) + 1)]
    return min((cinta(bm, co, 'cintura_ombligo', z), z) for z in alturas)


def punto_sagital(sagital, z, signo):
    """Punto del contorno sagital (x = 0) a la altura z: delante (signo -1) o detrás (+1)."""
    cerca = [p for a in sagital for p in a if abs(p.z - z) < 0.01]
    return max(cerca, key=lambda p: signo * p.y)


def medidas(bm):
    """Las 15 del catálogo, en cm, sin redondear."""
    co = coordenadas(bm)
    z0 = min(c.z for c in co)
    m = medidas_ajustables(bm)
    cintura, z_cintura = cintura_natural(bm, co)
    sagital = cortar(bm, (0, 0, 0), (1, 0, 0))
    delante, detras = punto_sagital(sagital, z_cintura, -1), punto_sagital(sagital, z_cintura, 1)
    nuca = max((co[i] for i in LAZOS['cuello']), key=lambda c: c.y)
    return {
        'estatura': m['estatura'], 'cuello': m['cuello'], 'hombros': m['hombros'], 'busto': m['busto'],
        'bajo_busto': cinta(bm, co, 'bajo_busto'),
        'cintura': cintura,
        'cadera': m['cadera'],
        'muslo': cinta(bm, co, 'muslo'),
        'rodilla': cinta(bm, co, 'rodilla'),
        'biceps': cinta(bm, co, 'biceps'),
        'talle_trasero': recorrido(bm, (0, 0, 0), (1, 0, 0), nuca, detras),
        'largo_brazo': m['largo_brazo'],
        'tiro': recorrido(bm, (0, 0, 0), (1, 0, 0), delante, detras),
        'entrepierna': m['entrepierna'],
        'altura_cintura': _cm(z_cintura - z0),
    }


def trazos(bm):
    """Los puntos de cada cinta, para dibujarlas sobre el cuerpo en la hoja de contactos."""
    co = coordenadas(bm)
    _, z = cintura_natural(bm, co)
    t = {k: cinta(bm, co, k, con_casco=True)[1] for k in ('cuello', 'busto', 'bajo_busto', 'cintura_ombligo', 'cadera', 'muslo', 'rodilla', 'biceps')}
    t['cintura'] = cinta(bm, co, 'cintura_ombligo', z, con_casco=True)[1]
    return t
```

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: el mismo comando del paso 2.
Esperado: siete líneas `ok …` y `medir_test: 7 pruebas OK`, con exit 0.

- [ ] **Step 5: Ignorar `__pycache__`**

Agregar al final de `.gitignore`:

```gitignore
# Blender compila los módulos de scripts/avatares/ al importarlos
__pycache__/
```

Run: `git status --short scripts/avatares` → no aparece `__pycache__`.

- [ ] **Step 6: Commit**

```bash
git add scripts/avatares/medir.py scripts/avatares/medir_test.py .gitignore
git commit -m "$(cat <<'EOF'
feat(avatares): medir.py — las 15 medidas con cinta sobre la malla

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: El ajuste — un cuerpo MPFB a sus medidas objetivo

**Files:**
- Create: `scripts/avatares/ajuste.py`
- Test: `scripts/avatares/ajuste_test.py`

**Interfaces:**
- Consumes: `medir.medidas_ajustables`, `scripts/avatares/tallas.json` (Tarea 1).
- Produces (`ajuste.py`):
  - `ajustar(body, objetivo, bitacora=print) -> (medidas, variables)`, que lanza `RuntimeError('no converge: <medida> …')` si alguna medida queda a más de 0,5 cm.
  - `macro_real(nombre, u)`, `evaluar(body)`, y las constantes `TOLERANCIA = 0.5`, `CONTROLES`, `LIMITE_CONTROL = 2.0`, `MACROS`.
  - `objetivo` puede traer solo algunas de las 8 medidas; las que no trae no se ajustan.

- [ ] **Step 1: Escribir la prueba que falla**

`scripts/avatares/ajuste_test.py`:

```python
"""El ajuste sobre un cuerpo real de MPFB:

    blender -b --python-exit-code 1 --python scripts/avatares/ajuste_test.py
"""
import json
import os
import sys

import bpy

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ajuste  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

# la variable u del macro height salta su zona muerta (0,49; 0,51), continua y creciente. Es la guarda
# de la regresión de hombre-eu48: el caso de convergencia de abajo no la reproduce sin el acabado cargado.
h = [ajuste.macro_real('height', k / 1000) for k in range(1001)]
assert all(a < b for a, b in zip(h, h[1:])), 'u debe ser estrictamente creciente'
assert not any(0.49 < v < 0.51 for v in h), 'u no puede caer en la zona muerta'
assert abs(h[0]) < 1e-12 and abs(h[500] - 0.49) < 1e-12 and abs(h[-1] - 1.0) < 1e-12
assert ajuste.macro_real('weight', 0.5) == 0.5
print('ok zona muerta de height')

tallas = {t['id']: t for t in json.load(open(os.path.join(AQUI, 'tallas.json'), encoding='utf-8'))['tallas']}


def cuerpo(gender, age):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update({'gender': gender, 'age': age})
    return HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)


# hombre-eu48: su estatura cae junto a la neutra, en la zona muerta del macro height
for id_, gender, age in (('mujer-eu48', 0.0, 0.5), ('nina-8', 0.0, 7 / 48), ('hombre-eu48', 1.0, 0.5)):
    objetivo = {k: float(v) for k, v in tallas[id_]['objetivo'].items()}
    m, _ = ajuste.ajustar(cuerpo(gender, age), objetivo, bitacora=lambda s: None)
    assert all(abs(m[k] - objetivo[k]) <= ajuste.TOLERANCIA for k in objetivo), (id_, m)
    print('ok converge', id_)

try:
    ajuste.ajustar(cuerpo(0.0, 0.5), {'estatura': 300.0, 'cintura_ombligo': 79.1}, bitacora=lambda s: None)
except RuntimeError as e:
    assert 'estatura' in str(e) and '300' in str(e), e
else:
    raise AssertionError('una estatura de 300 cm no se alcanza: debía fallar')
print('ajuste_test: 5 pruebas OK')
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `"$BLENDER" -b --python-exit-code 1 --python scripts/avatares/ajuste_test.py`
Esperado: exit 1 con `No module named 'ajuste'`. Esta suite necesita MPFB, así que va sin `--factory-startup`.

- [ ] **Step 3: Escribir `scripts/avatares/ajuste.py`**

```python
"""Ajuste de un cuerpo MPFB a sus medidas objetivo (spec § 4.3 pasos 2 a 4)."""
import os

import bmesh
import bpy
import numpy as np

import medir
from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

TOLERANCIA = 0.5  # cm (spec § 3.4)
# Medida ajustada → targets de MPFB que la mueven, con el mismo peso.
CONTROLES = {
    'busto': ['torso/measure-bust-circ'],
    'cintura_ombligo': ['torso/measure-waist-circ'],
    'cadera': ['torso/measure-hips-circ'],
    'cuello': ['neck/measure-neck-circ'],
    'hombros': ['torso/measure-shoulder-dist'],
    'largo_brazo': ['arms/measure-upperarm-length', 'arms/measure-lowerarm-length'],
    'entrepierna': ['legs/measure-upperleg-height', 'legs/measure-lowerleg-height'],
}
LIMITE_CONTROL = 2.0  # los targets measure-* se extrapolan hasta ±2: a ±1 no llegan las tallas grandes
# Los macros también son variables del ajuste fino: weight es la palanca gruesa del volumen, y una pierna
# más larga sube la estatura 1:1, así que estatura y entrepierna se resuelven juntas.
MACROS = ('height', 'weight')


def evaluar(body):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    try:
        return medir.medidas_ajustables(bm)
    finally:
        bm.free()


def macro_real(nombre, u):
    """El macro height no aplica ningún target entre 0,49 y 0,51 (data/targets/macrodetails/macro.json):
    un Newton que cae ahí se queda sin gradiente (le pasó a hombre-eu48). La variable u salta esa zona;
    en 0,49 y en 0,51 el cuerpo es el mismo, así que la estatura sigue continua y creciente en u."""
    if nombre != 'height':
        return u
    return 0.98 * u if u <= 0.5 else 0.51 + 0.98 * (u - 0.5)


def fijar_macro(body, nombre, u):
    HumanObjectProperties.set_value(nombre, macro_real(nombre, u), entity_reference=body)
    TargetService.reapply_macro_details(body)


def biseccion(body, macro, f, objetivo, pasos=16):
    """Valor (u) del macro con f(medidas) == objetivo; f crece con el macro. Se queda en el borde si no llega."""
    lo, hi = 0.0, 1.0
    for _ in range(pasos):
        mitad = (lo + hi) / 2
        fijar_macro(body, macro, mitad)
        if f(evaluar(body)) < objetivo:
            lo = mitad
        else:
            hi = mitad
    fijar_macro(body, macro, (lo + hi) / 2)
    return (lo + hi) / 2


def cargar_controles(body, claves):
    tdir = LocationService.get_mpfb_data('targets')
    for k in claves:
        for t in CONTROLES[k]:
            for s in ('incr', 'decr'):
                clave = TargetService.load_target(body, os.path.join(tdir, f'{t}-{s}.target.gz'), weight=0.0, name=f'{t}-{s}')
                clave.slider_max = LIMITE_CONTROL


def fijar(body, x):
    """x: {variable: valor}; variable = macro de MPFB (u, 0..1) o medida con controles (±LIMITE_CONTROL)."""
    if any(HumanObjectProperties.get_value(k, entity_reference=body) != macro_real(k, v) for k, v in x.items() if k in MACROS):
        for k, v in x.items():
            if k in MACROS:
                HumanObjectProperties.set_value(k, macro_real(k, v), entity_reference=body)
        TargetService.reapply_macro_details(body)
    for k, w in x.items():
        if k not in MACROS:
            for t in CONTROLES[k]:
                body.data.shape_keys.key_blocks[f'{t}-incr'].value = max(w, 0.0)
                body.data.shape_keys.key_blocks[f'{t}-decr'].value = max(-w, 0.0)


def rango(k):
    return (0.0, 1.0) if k in MACROS else (-LIMITE_CONTROL, LIMITE_CONTROL)


def newton(body, objetivo, x, iteraciones=12, paso=0.05):
    """Mínimos cuadrados sobre todas las variables a la vez. La que choca con su tope se congela ahí
    y el resto absorbe lo que falta. Devuelve (medidas, error por medida)."""
    ecuaciones, libres = list(objetivo), list(x)
    for _ in range(iteraciones):
        fijar(body, x)
        m = evaluar(body)
        err = np.array([objetivo[k] - m[k] for k in ecuaciones])
        if np.abs(err).max() < TOLERANCIA / 2 or not libres:
            break
        J = np.zeros((len(ecuaciones), len(libres)))
        for i, k in enumerate(libres):
            h = paso if x[k] + paso <= rango(k)[1] else -paso
            fijar(body, {**x, k: x[k] + h})
            m2 = evaluar(body)
            J[:, i] = [(m2[j] - m[j]) / h for j in ecuaciones]
        dx = np.linalg.lstsq(J, err, rcond=None)[0]
        for k, d in zip(list(libres), dx):
            lo, hi = rango(k)
            x[k] = float(np.clip(x[k] + d, lo, hi))
            if x[k] in (lo, hi):
                libres.remove(k)
    fijar(body, x)
    m = evaluar(body)
    return m, {k: round(m[k] - objetivo[k], 2) for k in ecuaciones}


def ajustar(body, objetivo, bitacora=print):
    """Lleva el cuerpo a `objetivo` (cm): macros height y weight por bisección (grueso) y luego todo por
    mínimos cuadrados (fino). Devuelve (medidas, variables). Falla si alguna queda a > 0,5 cm."""
    claves = [k for k in CONTROLES if k in objetivo]
    cargar_controles(body, claves)
    x = {'height': biseccion(body, 'height', lambda m: m['estatura'], objetivo['estatura']),
         'weight': biseccion(body, 'weight', lambda m: m['cintura_ombligo'], objetivo['cintura_ombligo'])}
    x |= {k: 0.0 for k in claves}
    m, err = newton(body, objetivo, x)
    bitacora(f'error {err} variables { {k: round(v, 3) for k, v in x.items()} }')
    peor = max(err, key=lambda k: abs(err[k]))
    if abs(err[peor]) > TOLERANCIA:
        raise RuntimeError(f'no converge: {peor} queda a {err[peor]} cm del objetivo {objetivo[peor]}; errores {err}')
    return m, x
```

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: el mismo comando del paso 2 (tarda cerca de 1 min).
Esperado: `ok zona muerta de height`, tres `ok converge …` y `ajuste_test: 5 pruebas OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/avatares/ajuste.py scripts/avatares/ajuste_test.py
git commit -m "$(cat <<'EOF'
feat(avatares): ajuste.py — el cuerpo MPFB a sus medidas objetivo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: El acabado de maniquí

**Files:**
- Create: `scripts/avatares/acabado.py`
- Test: `scripts/avatares/acabado_test.py`
- Genera, **sin commitear** todavía: `scripts/avatares/acabado/{mujer,hombre,nina,nino}/{pezones,entrepierna}.target`

**Interfaces:**
- Consumes: `medir.LAZOS`, `medir.plano_de_lazo`, `medir.cortar`, `medir.N_CUERPO`.
- Produces: `.target` de MPFB en `scripts/avatares/acabado/<grupo>/`, que `generar.py` carga con peso 1. También `cuerpo_base(grupo)`, `pesos_regiones(co, caras)`, `alisar(...)`, `escribir_target(ruta, nombre, desplazamientos)` y `diferencia(base, esculpido)`.

- [ ] **Step 1: Escribir la prueba que falla**

`scripts/avatares/acabado_test.py`:

```python
"""El acabado dentro de Blender con MPFB:

    blender -b --python-exit-code 1 --python scripts/avatares/acabado_test.py
"""
import os
import sys
import tempfile

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acabado  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

body, co, aristas, caras = acabado.cuerpo_base('mujer')

# 1) un .target escrito por acabado.py mueve cada vértice exactamente lo pedido: ejes XZY, -Y y escala
pedido = {8274: Vector((0.010, -0.020, 0.030)), 4121: Vector((0.0, 0.005, -0.004))}
ruta = os.path.join(tempfile.mkdtemp(), 'prueba.target')
assert acabado.escribir_target(ruta, 'prueba', pedido) == 2
TargetService.load_target(body, ruta, weight=1.0, name='prueba')
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
movido = [v.co.copy() for v in body.evaluated_get(dg).to_mesh().vertices]
for i, d in pedido.items():
    assert (movido[i] - co[i] - d).length < 1.5e-4, (i, movido[i] - co[i], d)
assert (movido[100] - co[100]).length < 1e-6
print('ok el .target mueve lo pedido')

# 2) las regiones: dos pezones a los lados, la entrepierna en el medio, pesos entre 0 y 1
pesos = acabado.pesos_regiones(co, caras)
pez = pesos['pezones']
assert any(co[i].x > 0 for i in pez) and any(co[i].x < 0 for i in pez)
assert all(0 < w <= 1 for r in pesos.values() for w in r.values())
centro_ent = sum((co[i] for i in pesos['entrepierna']), Vector()) / len(pesos['entrepierna'])
assert abs(centro_ent.x) < 0.01, centro_ent
print('ok regiones')

# 3) el alisado solo mueve la región, y un peso 0 no mueve nada
d = acabado.alisar(co, aristas, {i: 1.0 for i in pez} | {next(iter(pez)): 0.0}, 60)
assert set(d) <= set(pez)
assert d[next(iter(pez))].length == 0
assert max(v.length for v in d.values()) > 1e-4
print('ok alisado')

# 4) una escultura con otra topología se rechaza
try:
    acabado.diferencia(co, co[:-1])
except ValueError as e:
    assert 'Dyntopo' in str(e)
else:
    raise AssertionError('debía rechazar una escultura con otros vértices')
print('acabado_test: 4 pruebas OK')
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `"$BLENDER" -b --python-exit-code 1 --python scripts/avatares/acabado_test.py`
Esperado: exit 1 con `No module named 'acabado'`.

- [ ] **Step 3: Escribir `scripts/avatares/acabado.py`**

```python
"""Acabado de maniquí (spec § 4.2): desplazamientos guardados como .target de MPFB en acabado/<grupo>/.
generar.py los carga a peso 1 antes de ajustar, así que valen para todas las tallas del grupo.

    # manera 1, por script: pezones y entrepierna
    blender -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo mujer
    # manera 2, a mano: la cabeza lisa
    blender -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo mujer --preparar
    #   (esculpir .tmp/avatares/escultura-mujer.blend en Blender y guardar)
    blender -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo mujer --guardar-cabeza

La cabeza no va por script: alisarla con Taubin deja la cara casi igual, el laplaciano la encoge
hacia el cuello y el alisado radial la vuelve una bola con rasgos fantasma (los tres medidos el
2026-09-30). MPFB no trae grupos de vértices para estas regiones: se ubican con los lazos de medir.py.
"""
import argparse
import os
import sys

import bmesh
import bpy
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import medir  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

ESCALA_TARGET = 10.0  # m → unidades de MakeHuman (dm): lo que hace get_shape_key_as_dict con scale_factor 0,1
BASES = {  # cuerpo base de cada grupo: el acabado se calcula sobre él
    'mujer': {'gender': 0.0, 'age': 0.5},
    'hombre': {'gender': 1.0, 'age': 0.5},
    'nina': {'gender': 0.0, 'age': (8 - 1) / 48},
    'nino': {'gender': 1.0, 'age': (8 - 1) / 48},
}
# Perillas de calibración: se ajustan mirando la hoja de contactos.
REGIONES = {  # región: (radio en m para un cuerpo de 1,70 m, iteraciones de alisado)
    'pezones': (0.035, 60),
    'entrepierna': (0.06, 60),
}


def suave(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def cuerpo_base(grupo):
    """El cuerpo base del grupo: (objeto, coordenadas, aristas, caras) del cuerpo sin ayudantes."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update(BASES[grupo])
    body = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = [v.co.copy() for v in me.vertices]
    aristas = [tuple(e.vertices) for e in me.edges]
    caras = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    if len(co) != medir.N_CUERPO:
        raise RuntimeError(f'el cuerpo base tiene {len(co)} vértices; se esperaban {medir.N_CUERPO}')
    return body, co, aristas, caras


def malla(co, caras):
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in co]
    for f in caras:
        bm.faces.new([vs[i] for i in f])
    bm.verts.index_update()
    return bm


def pesos_regiones(co, caras):
    """{región: {índice: peso 0..1}}: esferas alrededor de cada ápice del busto y de la horcajadura."""
    escala = (max(c.z for c in co) - min(c.z for c in co)) / 1.70
    z_busto = medir.plano_de_lazo(co, medir.LAZOS['busto'])[0].z
    r = REGIONES['pezones'][0] * escala
    centros = {'pezones': [], 'entrepierna': []}
    for lado in (1, -1):
        cerca = [c for c in co if abs(c.z - z_busto) < 2 * r and lado * c.x > r]
        centros['pezones'].append(min(cerca, key=lambda c: c.y))  # el más adelantado: -y es adelante
    bm = malla(co, caras)
    centros['entrepierna'].append(min((p for a in medir.cortar(bm, (0, 0, 0), (1, 0, 0)) for p in a), key=lambda p: p.z))
    bm.free()
    pesos = {}
    for region, puntos in centros.items():
        radio = REGIONES[region][0] * escala
        pesos[region] = {}
        for i, c in enumerate(co):
            d = min((c - p).length for p in puntos)
            if d < radio:
                pesos[region][i] = 1 - suave(d / radio)
    return pesos


def alisar(co, aristas, pesos, iteraciones, lam=0.5):
    """Desplazamientos {índice: Vector} del alisado laplaciano de la región, multiplicados por el peso.
    bmesh.ops.smooth_laplacian_vert no mueve nada en Blender 5.0 (probado): por eso va a mano."""
    vecinos = {i: [] for i in pesos}
    for a, b in aristas:
        if a in vecinos:
            vecinos[a].append(b)
        if b in vecinos:
            vecinos[b].append(a)
    pos = list(co)
    for _ in range(iteraciones):
        nuevo = {i: pos[i] + lam * (sum((pos[j] for j in vs), Vector()) / len(vs) - pos[i]) for i, vs in vecinos.items()}
        for i, v in nuevo.items():
            pos[i] = v
    return {i: (pos[i] - co[i]) * w for i, w in pesos.items()}


def escribir_target(ruta, nombre, desplazamientos, umbral=1e-5):
    """Desplazamientos en metros (ejes de Blender) → .target de MPFB. Devuelve cuántos vértices lleva."""
    info = {'name': nombre, 'vertices': [(i, *(d * ESCALA_TARGET)) for i, d in sorted(desplazamientos.items()) if d.length > umbral]}
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(TargetService.shape_key_info_as_target_string(info))
    return len(info['vertices'])


def diferencia(base, esculpido):
    if len(esculpido) != len(base):
        raise ValueError(f'la escultura tiene {len(esculpido)} vértices y la base {len(base)}: no uses Dyntopo, Remesh ni borres geometría')
    return {i: e - b for i, (b, e) in enumerate(zip(base, esculpido))}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--grupo', required=True, choices=sorted(BASES))
    p.add_argument('--preparar', action='store_true')
    p.add_argument('--guardar-cabeza', action='store_true')
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    blend = os.path.abspath(os.path.join('.tmp', 'avatares', f'escultura-{a.grupo}.blend'))
    salida = os.path.join(AQUI, 'acabado', a.grupo)
    body, co, aristas, caras = cuerpo_base(a.grupo)
    if a.preparar:
        me = bpy.data.meshes.new('escultura')
        me.from_pydata([tuple(c) for c in co], [], caras)
        ob = bpy.data.objects.new('escultura', me)
        bpy.data.objects.remove(body)
        bpy.context.scene.collection.objects.link(ob)
        os.makedirs(os.path.dirname(blend), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=blend)
        print(f'acabado: esculpe la cabeza en {blend} (modo Sculpt, simetría X, sin Dyntopo) y guarda')
    elif a.guardar_cabeza:
        with bpy.data.libraries.load(blend) as (desde, hacia):
            hacia.objects = ['escultura']
        d = diferencia(co, [v.co.copy() for v in hacia.objects[0].data.vertices])
        centro, normal = medir.plano_de_lazo(co, medir.LAZOS['cuello'])
        arriba = normal if normal.z > 0 else -normal
        abajo = sum(1 for i, v in d.items() if v.length > 1e-4 and (co[i] - centro).dot(arriba) < 0)
        n = escribir_target(os.path.join(salida, 'cabeza.target'), 'cabeza', d)
        print(f'acabado {a.grupo}/cabeza.target: {n} vértices' + (f'; ojo: {abajo} están bajo el cuello' if abajo else ''))
    else:
        for region, pesos in pesos_regiones(co, caras).items():
            n = escribir_target(os.path.join(salida, f'{region}.target'), region, alisar(co, aristas, pesos, REGIONES[region][1]))
            print(f'acabado {a.grupo}/{region}.target: {n} vértices')


if __name__ == '__main__':
    main()
```

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: el mismo comando del paso 2.
Esperado: `acabado_test: 4 pruebas OK`. La primera prueba es la que vigila los ejes XZY, -Y y la escala del `.target`: con `ESCALA_TARGET = 1.0` falla, porque el vértice se mueve 10 veces menos.

- [ ] **Step 5: Generar el acabado por script de los cuatro grupos**

```bash
for g in mujer hombre nina nino; do "$BLENDER" -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo $g 2>&1 | grep '^acabado'; done
```
Esperado:
```
acabado mujer/pezones.target: 152 vértices
acabado mujer/entrepierna.target: 49 vértices
acabado hombre/pezones.target: 86 vértices
acabado hombre/entrepierna.target: 62 vértices
acabado nina/pezones.target: 16 vértices
acabado nina/entrepierna.target: 38 vértices
acabado nino/pezones.target: 132 vértices
acabado nino/entrepierna.target: 58 vértices
```
Estos `.target` todavía **no se commitean**: entran en la Tarea 9, después de la aprobación.

- [ ] **Step 6: Commit (solo el código)**

```bash
git add scripts/avatares/acabado.py scripts/avatares/acabado_test.py
git commit -m "$(cat <<'EOF'
feat(avatares): acabado.py — pezones y entrepierna por script, cabeza a mano

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Una avatar por proceso de Blender

**Files:**
- Create: `scripts/avatares/generar.py`

**Interfaces:**
- Consumes: `tallas.json`, `ajuste.ajustar`, `medir.medidas`, `medir.trazos`, `medir.N_CUERPO` y `scripts/avatares/acabado/<grupo>/*.target`.
- Produces, en `--salida`:
  - `<id>.glb`, sin comprimir;
  - `<id>.webp`, la miniatura de 512×512 con frente y perfil;
  - `<id>-hoja.png`, de 900×900, con las cintas;
  - `<id>.json` = `{ entrada, informe }`.

  `entrada` = `{ id, grupo, talla, archivo: '<id>.glb', miniatura: '<id>.webp', medidas: {15 en cm con 1 decimal; bajo_busto solo en mujer y niña ≥ 10}, fuente, generador: '1.0.0' }`, como en § 3.1. `informe` = `{ objetivo, ajustadas, error, variables, acabado, n }`.

Las pruebas de esta tarea son las guardas del propio script: la versión de MPFB y de Blender, 13380 vértices tras hornear, ningún vértice movido más de 0,1 mm, los 52 huesos y el ajuste a ≤ 0,5 cm.

- [ ] **Step 1: Escribir `scripts/avatares/generar.py`**

```python
"""Una avatar de la biblioteca por llamada (spec § 4.3). Blender sin interfaz:

    blender -b --python-exit-code 1 --python scripts/avatares/generar.py -- --talla mujer-eu38 --salida .tmp/avatares

Escribe en --salida: <id>.glb (sin comprimir: generar-todas.mjs lo pasa por meshopt), <id>.webp
(miniatura, frente y perfil), <id>-hoja.png (con las cintas dibujadas, para la hoja de contactos) y
<id>.json ({entrada: la del catálogo, informe: el ajuste}). Sin --python-exit-code 1, un error de
Python dentro de Blender sale con código 0.
"""
import argparse
import glob
import json
import math
import os
import sys
import tomllib

import bmesh
import bpy
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ajuste  # noqa: E402
import medir  # noqa: E402
from bl_ext.blender_org import mpfb  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

GENERADOR = '1.0.0'  # súbelo cuando cambie algo que se ve en la malla o en las medidas
MPFB = '2.0.17'
BLENDER = (5, 0)
GRIS = 0.72  # sRGB. Va en textura: la app pone el color del material en blanco (AvatarModel.tsx:662)
HUESOS = {
    'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
    'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3', 'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
    'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3', 'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
    'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3', 'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
    'RightHandRing1', 'RightHandRing2', 'RightHandRing3', 'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
}  # los 52 del avatar de hoy (public/default-avatar.glb), sin el prefijo mixamorig:
SEXO = {'mujer': 0.0, 'hombre': 1.0, 'nina': 0.0, 'nino': 1.0}


def verificar_versiones():
    with open(os.path.join(os.path.dirname(mpfb.__file__), 'blender_manifest.toml'), 'rb') as f:
        v = tomllib.load(f)['version']
    if v != MPFB:
        raise SystemExit(f'MPFB {v} instalado; el generador está fijado a {MPFB}')
    if tuple(bpy.app.version[:2]) != BLENDER:
        raise SystemExit(f'Blender {bpy.app.version_string}; el generador está fijado a {BLENDER[0]}.{BLENDER[1]}')


def coordenadas_evaluadas(body):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    co = [body.matrix_world @ v.co for v in ev.to_mesh().vertices]
    ev.to_mesh_clear()
    return co


def hornear(body):
    """Rig mixamo, shape keys a la malla, fuera los ayudantes, pies al suelo. Devuelve el rig."""
    antes = coordenadas_evaluadas(body)
    rig = HumanService.add_builtin_rig(body, 'mixamo')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(body.modifiers):
        if m.type == 'MASK':
            bpy.ops.object.modifier_apply(modifier=m.name)
    suelo = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    rig.location.z -= suelo
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    despues = [body.matrix_world @ v.co for v in body.data.vertices]
    if len(despues) != medir.N_CUERPO:
        raise RuntimeError(f'tras hornear quedan {len(despues)} vértices; se esperaban {medir.N_CUERPO}')
    desvio = max((d - (a - Vector((0, 0, suelo)))).length for a, d in zip(antes, despues))
    if desvio > 1e-4:
        raise RuntimeError(f'hornear movió la malla {desvio * 1000:.2f} mm: los índices de medir.py ya no valen')
    for b in rig.data.bones:
        b.name = b.name.replace('mixamorig:', '')
    faltan = HUESOS - {b.name for b in rig.data.bones}
    if faltan:
        raise RuntimeError(f'faltan huesos: {sorted(faltan)}')
    body.name, rig.name = 'vina_body', 'Armature'
    return rig


def material(body):
    mat = bpy.data.materials.new('vina_body_material')
    mat.use_nodes = True
    lineal = ((GRIS + 0.055) / 1.055) ** 2.4
    mat.diffuse_color = (lineal, lineal, lineal, 1)  # lo que pinta el render de la miniatura
    img = bpy.data.images.new('vina_body_gris', 4, 4)
    img.pixels = [GRIS, GRIS, GRIS, 1.0] * 16
    img.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.7
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    body.data.materials.clear()
    body.data.materials.append(mat)


def bm_final(body):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    return bm


def linea(nombre, puntos, mat):
    cu = bpy.data.curves.new(nombre, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0015
    sp = cu.splines.new('POLY')
    sp.points.add(len(puntos) - 1)
    for i, p in enumerate(puntos):
        sp.points[i].co = (p.x, p.y, p.z, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(nombre, cu)
    ob.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def fotografiar(body, alto, ruta_webp, ruta_hoja, trazos):
    """Frente y perfil en una imagen: la miniatura limpia y la de la hoja con las cintas."""
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.view_settings.view_transform = 'Standard'
    mundo = bpy.data.worlds.new('fondo')
    mundo.color = (1, 1, 1)
    scn.world = mundo
    dg = bpy.context.evaluated_depsgraph_get()
    perfil = bpy.data.objects.new('perfil', bpy.data.meshes.new_from_object(body.evaluated_get(dg)))
    scn.collection.objects.link(perfil)
    xs = [v.co.x for v in body.data.vertices]
    ys = [v.co.y for v in body.data.vertices]
    # el perfil, girado 90°, mira a la derecha: su x va de desde − max(y) a desde − min(y)
    desde = max(xs) + alto * 0.1 + max(ys)
    giro = Matrix.Translation((desde, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    perfil.matrix_world = giro
    izq, der = min(xs), desde - min(ys)
    cam = bpy.data.objects.new('camara', bpy.data.cameras.new('camara'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(der - izq, alto) * 1.06
    cam.location = ((izq + der) / 2, -10, alto / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scn.render.resolution_x = scn.render.resolution_y = 512
    scn.render.image_settings.file_format = 'WEBP'
    scn.render.image_settings.quality = 80
    scn.render.filepath = ruta_webp
    bpy.ops.render.render(write_still=True)
    rojo = bpy.data.materials.new('cinta')
    rojo.diffuse_color = (0.8, 0.05, 0.05, 1)
    for k, pts in trazos.items():
        linea(f'cinta-{k}', pts, rojo)
        linea(f'cinta-{k}-perfil', [giro @ p for p in pts], rojo)
    scn.render.resolution_x = scn.render.resolution_y = 900
    scn.render.image_settings.file_format = 'PNG'
    scn.render.filepath = ruta_hoja
    bpy.ops.render.render(write_still=True)


def entrada_de_catalogo(talla, m):
    medidas = {k: round(v, 1) for k, v in m.items()}
    lleva_bajo_busto = talla['grupo'] == 'mujer' or (talla['grupo'] == 'nina' and talla['talla']['edad'] >= 10)
    if not lleva_bajo_busto:
        del medidas['bajo_busto']
    return {'id': talla['id'], 'grupo': talla['grupo'], 'talla': talla['talla'],
            'archivo': f"{talla['id']}.glb", 'miniatura': f"{talla['id']}.webp",
            'medidas': medidas, 'fuente': talla['fuente'], 'generador': GENERADOR}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--talla', required=True)
    p.add_argument('--salida', required=True)
    p.add_argument('--tallas', default=os.path.join(AQUI, 'tallas.json'))
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    verificar_versiones()
    with open(a.tallas, encoding='utf-8') as f:
        talla = next((t for t in json.load(f)['tallas'] if t['id'] == a.talla), None)
    if talla is None:
        raise SystemExit(f'{a.talla} no está en {a.tallas}')
    os.makedirs(a.salida, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro['gender'] = SEXO[talla['grupo']]
    edad = talla['talla'].get('edad')
    macro['age'] = 0.5 if edad is None else (edad - 1) / 48  # años → macro: MakeHuman 1.1, apps/human.py setAgeYears
    body = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)
    acabados = sorted(glob.glob(os.path.join(AQUI, 'acabado', talla['grupo'], '*.target')))
    for t in acabados:
        TargetService.load_target(body, t, weight=1.0, name='acabado-' + os.path.basename(t)[:-len('.target')])
    objetivo = {k: float(v) for k, v in talla['objetivo'].items()}
    ajustadas, variables = ajuste.ajustar(body, objetivo, bitacora=lambda s: print(f'[{a.talla}] {s}'))

    hornear(body)
    material(body)
    bm = bm_final(body)
    m = medir.medidas(bm)
    trazos = medir.trazos(bm)
    bm.free()
    base = os.path.join(os.path.abspath(a.salida), a.talla)  # Blender resuelve las rutas relativas del render contra la raíz de la unidad
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=base + '.glb', export_format='GLB', export_skins=True,
                              export_morph=False, export_animations=False)
    fotografiar(body, m['estatura'] / 100, base + '.webp', base + '-hoja.png', trazos)
    informe = {'objetivo': objetivo, 'ajustadas': {k: round(ajustadas[k], 2) for k in objetivo},
               'error': {k: round(ajustadas[k] - objetivo[k], 2) for k in objetivo},
               'variables': {k: round(v, 4) for k, v in variables.items()},
               'acabado': [os.path.basename(t) for t in acabados], 'n': talla['n']}
    with open(base + '.json', 'w', encoding='utf-8') as f:
        json.dump({'entrada': entrada_de_catalogo(talla, m), 'informe': informe}, f, ensure_ascii=False, indent=1)
    print(f'[{a.talla}] listo: {json.dumps(informe["error"])}')


main()
```

- [ ] **Step 2: Una talla que no existe falla con un mensaje claro**

Run: `"$BLENDER" -b --python-exit-code 1 --python scripts/avatares/generar.py -- --talla no-existe --salida .tmp/avatares; echo "exit=$?"`
Esperado: `no-existe no está en …tallas.json` y `exit=1`.

- [ ] **Step 3: Generar `mujer-eu38`**

Run: `"$BLENDER" -b --python-exit-code 1 --python scripts/avatares/generar.py -- --talla mujer-eu38 --salida .tmp/avatares 2>&1 | grep '^\[mujer'`
Esperado, en unos 10 s:
- `[mujer-eu38] error {… todas en 0.0 …} variables {'height': …, 'weight': …}`;
- `[mujer-eu38] listo: {…}`;
- en `.tmp/avatares/` quedan `mujer-eu38.glb` (unos 930 KB), `mujer-eu38.webp` (unos 8 KB), `mujer-eu38-hoja.png` y `mujer-eu38.json`.

Si no aparecen las imágenes, revisa `C:\salida\`: Blender resuelve las rutas relativas del render contra la raíz de la unidad, y el `abspath` de `main()` está justamente para evitarlo.

- [ ] **Step 4: Revisar la entrada y la hoja**

Run: `node -e "const r=require('./.tmp/avatares/mujer-eu38.json'); console.log(Object.keys(r.entrada.medidas).length, JSON.stringify(r.entrada.medidas), JSON.stringify(r.informe.error))"`
Esperado:
- 15 medidas, con valores cercanos (± 0,2) a estatura 161,4, cuello 31,6, hombros 36,1, busto 88,0, bajo busto 73,2, cintura 70,9, cadera 97,0 y entrepierna 77,7;
- todos los errores en 0.

Abre `.tmp/avatares/mujer-eu38-hoja.png`: se ven frente y perfil completos, sin cortes, con las cintas rojas de cuello, busto, bajo busto, las dos de la cintura, cadera, muslo, rodilla y bíceps.

- [ ] **Step 5: Commit**

```bash
git add scripts/avatares/generar.py
git commit -m "$(cat <<'EOF'
feat(avatares): generar.py — una avatar por proceso de Blender

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `npm run avatares` — paralelo, meshopt, catálogo y hoja de contactos

**Files:**
- Create: `scripts/avatares/generar-todas.mjs`
- Test: `tests/repo/avatares-generar.test.ts`
- Modify: `package.json` (dos scripts y cuatro devDependencies), `package-lock.json`

**Interfaces:**
- Consumes: `generar.py` (Tarea 5), `tallas.json` y las tres suites `*_test.py`.
- Produces:
  - `public/avatares/<id>.glb` (meshopt, ≤ 600 KB; medido: 258 KB);
  - `public/avatares/<id>.webp`;
  - `src/avatares/catalogo.json`, un arreglo de entradas en el orden de `tallas.json`;
  - `.tmp/avatares/hoja.html` y `hoja.png`.
- Exports (para las pruebas): `HUESOS`, `nombre(entrada)`, `huesosDelGlb(buf)`, `mezclarCatalogo(anterior, nuevas, orden)` y `hojaHtml(resultados)`.

- [ ] **Step 1: Dependencias y scripts**

```bash
npm i -D @gltf-transform/core@^4.5.1 @gltf-transform/extensions@^4.5.1 @gltf-transform/functions@^4.5.1 meshoptimizer@^1.3.0
```
En `package.json`, agregar a `"scripts"` después de `"home:activos"` (sin olvidar la coma de la línea anterior):
```json
    "avatares": "node scripts/avatares/generar-todas.mjs",
    "avatares:tallas": "node scripts/avatares/tallas.mjs"
```

- [ ] **Step 2: Escribir la prueba que falla**

`tests/repo/avatares-generar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
// @ts-expect-error — módulo .mjs sin tipos
import { HUESOS, huesosDelGlb, mezclarCatalogo, nombre, hojaHtml } from '../../scripts/avatares/generar-todas.mjs';

/** Un GLB mínimo: cabecera + bloque JSON (sin binario). */
function glb(json: object): Buffer {
  let txt = JSON.stringify(json);
  while (txt.length % 4) txt += ' ';
  const cuerpo = Buffer.from(txt);
  const cab = Buffer.alloc(20);
  cab.writeUInt32LE(0x46546c67, 0);
  cab.writeUInt32LE(2, 4);
  cab.writeUInt32LE(20 + cuerpo.length, 8);
  cab.writeUInt32LE(cuerpo.length, 12);
  cab.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([cab, cuerpo]);
}

describe('generar-todas', () => {
  it('lee los huesos del primer skin del GLB', () => {
    const nodos = HUESOS.map((name: string) => ({ name }));
    expect(huesosDelGlb(glb({ nodes: [{ name: 'vina_body' }, ...nodos], skins: [{ joints: HUESOS.map((_: string, i: number) => i + 1) }] }))).toEqual(HUESOS);
    expect(huesosDelGlb(glb({ nodes: [] }))).toEqual([]);
    expect(() => huesosDelGlb(Buffer.from('no soy un glb, no soy un glb'))).toThrow(/GLB/);
  });

  it('regenerar unas tallas no borra las demás del catálogo y respeta el orden de tallas.json', () => {
    const anterior = [{ id: 'mujer-eu38', v: 1 }, { id: 'nino-8', v: 1 }];
    const nuevas = [{ id: 'nino-8', v: 2 }, { id: 'hombre-eu50', v: 2 }];
    expect(mezclarCatalogo(anterior, nuevas, ['mujer-eu38', 'hombre-eu50', 'nina-8', 'nino-8'])).toEqual([
      { id: 'mujer-eu38', v: 1 }, { id: 'hombre-eu50', v: 2 }, { id: 'nino-8', v: 2 },
    ]);
  });

  it('nombra la talla como la lee María', () => {
    expect(nombre({ grupo: 'mujer', talla: { eu: '38', us: '8' } })).toBe('Mujer EU 38 · US 8');
    expect(nombre({ grupo: 'nina', talla: { edad: 8 } })).toBe('Niña 8 años');
  });

  it('la hoja muestra la falla con su error, escapado', () => {
    const html = hojaHtml([{ id: 'nino-2', ok: false, error: 'no converge: <estatura>' }]);
    expect(html).toContain('<h2>nino-2</h2>');
    expect(html).toContain('no converge: &lt;estatura&gt;');
  });
});
```

- [ ] **Step 3: Correrla y verla fallar**

Run: `npx vitest run tests/repo/avatares-generar.test.ts`
Esperado: FAIL, porque no encuentra `scripts/avatares/generar-todas.mjs`.

- [ ] **Step 4: Escribir `scripts/avatares/generar-todas.mjs`**

```js
/**
 * La biblioteca de avatares entera (spec docs/superpowers/specs/2026-09-29-biblioteca-de-avatares-design.md § 4.4).
 *
 *   npm run avatares                                   # las 31
 *   npm run avatares -- --solo mujer-eu38,nino-8       # solo esas; el resto del catálogo se conserva
 *   npm run avatares -- --probar                       # las pruebas que corren dentro de Blender
 *
 * Cada avatar es un proceso de Blender (generar.py) que escribe en .tmp/avatares/. Después: meshopt al
 * GLB → public/avatares/<id>.glb, la miniatura → public/avatares/<id>.webp, las entradas →
 * src/avatares/catalogo.json, y la hoja de contactos → .tmp/avatares/hoja.html y hoja.png.
 * Blender: la variable de entorno BLENDER o la ruta de instalación por defecto de Windows.
 * Nunca corre en el servidor ni en el deploy: los GLB generados se commitean.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const TMP = path.join(RAIZ, '.tmp', 'avatares');
const PUBLICO = path.join(RAIZ, 'public', 'avatares');
const CATALOGO = path.join(RAIZ, 'src', 'avatares', 'catalogo.json');
const BLENDER = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.0/blender.exe';
const MAX_GLB = 600 * 1024; // sin meshopt pesa ~930 KB: por encima de esto, la compresión no corrió

export const HUESOS = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
  'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3', 'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
  'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3', 'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
  'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3', 'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
  'RightHandRing1', 'RightHandRing2', 'RightHandRing3', 'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
]; // los 52 del avatar de hoy (public/default-avatar.glb)

const GRUPOS = { mujer: 'Mujer', hombre: 'Hombre', nina: 'Niña', nino: 'Niño' };

/** "Mujer EU 38 · US 8" / "Niña 8 años". */
export function nombre({ grupo, talla }) {
  return talla.edad !== undefined ? `${GRUPOS[grupo]} ${talla.edad} años` : `${GRUPOS[grupo]} EU ${talla.eu} · US ${talla.us}`;
}

/** Nombres de los huesos del primer skin de un GLB, leyendo solo su bloque JSON (meshopt no lo toca). */
export function huesosDelGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('no es un GLB');
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + buf.readUInt32LE(12)));
  return (gltf.skins?.[0]?.joints ?? []).map((i) => gltf.nodes[i].name);
}

/** Las entradas regeneradas reemplazan a las suyas, las demás se conservan, en el orden de tallas.json. */
export function mezclarCatalogo(anterior, nuevas, orden) {
  const porId = new Map([...anterior, ...nuevas].map((e) => [e.id, e]));
  return orden.filter((id) => porId.has(id)).map((id) => porId.get(id));
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function hojaHtml(resultados) {
  const tarjeta = (r) => {
    if (!r.ok) return `<article class="falla"><h2>${escapar(r.id)}</h2><pre>${escapar(r.error)}</pre></article>`;
    const { entrada: e, informe: i } = r;
    const peor = Math.max(...Object.values(i.error).map(Math.abs));
    const filas = Object.entries(e.medidas).map(([k, v]) => `<tr><td>${k.replace('_', ' ')}</td><td>${v.toFixed(1)}</td></tr>`).join('');
    return `<article><img src="${e.id}-hoja.png" alt="${escapar(nombre(e))}" width="450" height="450">
<h2>${escapar(nombre(e))}</h2><p>${i.n} personas · ${escapar(e.fuente)} · ajuste: peor error ${peor.toFixed(2)} cm · weight ${i.variables.weight.toFixed(2)}</p>
<table>${filas}</table></article>`;
  };
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>Biblioteca de avatares — hoja de contactos</title>
<style>body{font:13px system-ui;margin:16px;background:#fff;color:#222}main{display:flex;flex-wrap:wrap;gap:16px}
article{width:450px}h2{font-size:15px;margin:4px 0}p{margin:0 0 4px;color:#555}table{border-collapse:collapse}
td{padding:1px 8px 1px 0}td+td{text-align:right}.falla{color:#a00}</style>
<h1>Biblioteca de avatares — hoja de contactos</h1><main>${resultados.map(tarjeta).join('\n')}</main></html>\n`;
}

function correrBlender(args, log) {
  return new Promise((resolve) => {
    const salida = createWriteStream(log);
    const p = spawn(BLENDER, args, { cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.pipe(salida);
    p.stderr.pipe(salida);
    p.on('error', (e) => { salida.end(String(e)); resolve(1); });
    p.on('close', (code) => { salida.end(); resolve(code); });
  });
}

async function enParalelo(items, n, f) {
  const res = [];
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      res[i] = await f(items[i]);
    }
  }));
  return res;
}

async function comprimir(entrada, salida) {
  const { Logger, NodeIO } = await import('@gltf-transform/core');
  const { EXTMeshoptCompression, KHRMeshQuantization } = await import('@gltf-transform/extensions');
  const { meshopt } = await import('@gltf-transform/functions');
  const { MeshoptEncoder } = await import('meshoptimizer');
  await MeshoptEncoder.ready;
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.WARN))
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const doc = await io.read(entrada);
  doc.setLogger(new Logger(Logger.Verbosity.WARN));
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(salida, doc);
}

async function generarUna(id) {
  const base = path.join(TMP, id);
  for (const ext of ['.json', '.glb', '.webp', '-hoja.png']) rmSync(base + ext, { force: true }); // un fallo no hereda archivos viejos
  const code = await correrBlender(['-b', '--python-exit-code', '1', '--python', path.join(AQUI, 'generar.py'), '--', '--talla', id, '--salida', TMP], base + '.log');
  const faltan = ['.json', '.glb', '.webp', '-hoja.png'].filter((ext) => !existsSync(base + ext));
  if (code !== 0 || faltan.length) {
    const cola = existsSync(base + '.log') ? readFileSync(base + '.log', 'utf8').split('\n').slice(-12).join('\n') : '';
    return { id, ok: false, error: `Blender salió con ${code}${faltan.length ? `; faltan ${faltan.join(', ')}` : ''}\n${cola}` };
  }
  const glb = path.join(PUBLICO, `${id}.glb`);
  await comprimir(base + '.glb', glb);
  const peso = statSync(glb).size;
  if (peso > MAX_GLB) return { id, ok: false, error: `${id}.glb pesa ${peso} bytes tras meshopt (máximo ${MAX_GLB})` };
  const huesos = huesosDelGlb(readFileSync(glb));
  const faltanHuesos = HUESOS.filter((h) => !huesos.includes(h));
  if (huesos.length !== HUESOS.length || faltanHuesos.length) return { id, ok: false, error: `huesos: ${huesos.length}, faltan ${faltanHuesos.join(', ')}` };
  copyFileSync(base + '.webp', path.join(PUBLICO, `${id}.webp`));
  return { id, ok: true, peso, ...JSON.parse(readFileSync(base + '.json', 'utf8')) };
}

async function probar() {
  const pruebas = [['medir_test.py', ['--factory-startup']], ['acabado_test.py', []], ['ajuste_test.py', []]];
  mkdirSync(TMP, { recursive: true });
  let fallas = 0;
  for (const [archivo, extra] of pruebas) {
    const log = path.join(TMP, archivo.replace('.py', '.log'));
    const code = await correrBlender(['-b', ...extra, '--python-exit-code', '1', '--python', path.join(AQUI, archivo)], log);
    console.log(`${code === 0 ? 'ok   ' : 'FALLA'} ${archivo}${code === 0 ? '' : ` (ver ${log})`}`);
    fallas += code === 0 ? 0 : 1;
  }
  return fallas;
}

async function main() {
  if (!existsSync(BLENDER)) throw new Error(`no encuentro Blender en ${BLENDER}; pon su ruta en la variable BLENDER`);
  if (process.argv.includes('--probar')) process.exit(await probar() ? 1 : 0);
  const tallas = JSON.parse(readFileSync(path.join(AQUI, 'tallas.json'), 'utf8')).tallas.map((t) => t.id);
  const i = process.argv.indexOf('--solo');
  const ids = i > 0 ? process.argv[i + 1].split(',') : tallas;
  const desconocidas = ids.filter((id) => !tallas.includes(id));
  if (desconocidas.length) throw new Error(`no están en tallas.json: ${desconocidas.join(', ')}`);
  for (const d of [TMP, PUBLICO, path.dirname(CATALOGO)]) mkdirSync(d, { recursive: true });

  const n = Math.max(1, Math.min(8, Math.floor(availableParallelism() / 2)));
  console.log(`${ids.length} avatares, ${n} Blender a la vez`);
  const resultados = await enParalelo(ids, n, async (id) => {
    const r = await generarUna(id);
    console.log(`${r.ok ? 'ok   ' : 'FALLA'} ${id}${r.ok ? ` ${(r.peso / 1024).toFixed(0)} KB` : `: ${r.error.split('\n')[0]}`}`);
    return r;
  });

  const anterior = existsSync(CATALOGO) ? JSON.parse(readFileSync(CATALOGO, 'utf8')) : [];
  const catalogo = mezclarCatalogo(anterior, resultados.filter((r) => r.ok).map((r) => r.entrada), tallas);
  writeFileSync(CATALOGO, JSON.stringify(catalogo, null, 2) + '\n');
  const hoja = path.join(TMP, 'hoja.html');
  writeFileSync(hoja, hojaHtml(resultados));
  const { chromium } = await import('@playwright/test');
  const navegador = await chromium.launch();
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
  await pagina.goto(pathToFileURL(hoja).href);
  await pagina.screenshot({ path: path.join(TMP, 'hoja.png'), fullPage: true });
  await navegador.close();
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`catálogo: ${catalogo.length} entradas → ${path.relative(RAIZ, CATALOGO)}\nhoja de contactos: ${path.relative(RAIZ, hoja)} y hoja.png`);
  if (fallas.length) {
    console.error(`${fallas.length} fallaron: ${fallas.map((r) => r.id).join(', ')}`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
```

- [ ] **Step 5: Correr la prueba y verla pasar**

Run: `npx vitest run tests/repo/avatares-generar.test.ts tests/repo/avatares-tallas.test.ts`
Esperado: 16 passed.

- [ ] **Step 6: Las pruebas de Blender, de un golpe**

Run: `npm run avatares -- --probar`
Esperado:
```
ok    medir_test.py
ok    acabado_test.py
ok    ajuste_test.py
```

- [ ] **Step 7: Una talla por grupo**

Run: `npm run avatares -- --solo mujer-eu38,hombre-eu50,nina-8,nino-8`
Esperado, en unos 25 s: cuatro líneas `ok    <id> 258 KB`, luego `catálogo: 4 entradas → src\avatares\catalogo.json` y `hoja de contactos: .tmp\avatares\hoja.html y hoja.png`.

- [ ] **Step 8: Revisar la salida**

```bash
node -e "const c=require('./src/avatares/catalogo.json'); console.log(c.map(e=>e.id).join(' '))"
ls -la public/avatares/
```
Esperado: `mujer-eu38 hombre-eu50 nina-8 nino-8` (el orden de `tallas.json`), y en `public/avatares/` 4 `.glb` de unos 258 KB más 4 `.webp`. Abre `.tmp/avatares/hoja.png`: son cuatro tarjetas, cada una con su imagen, el nombre ("Mujer EU 38 · US 8", "Niña 8 años"), las personas de la banda, el peor error del ajuste y las 15 medidas.

- [ ] **Step 9: Una talla que falla no pasa por buena (Review Focus 1 y 3)**

```bash
node -e "const f='scripts/avatares/tallas.json',j=require('./'+f); j.tallas.find(t=>t.id==='nino-2').objetivo.estatura=300; require('fs').writeFileSync(f, JSON.stringify(j,null,2)+'\n')"
npm run avatares -- --solo nino-2; echo "exit=$?"
node -e "console.log(require('./src/avatares/catalogo.json').map(e=>e.id).join(' '))"
git checkout -- scripts/avatares/tallas.json
```
Esperado:
- `FALLA nino-2: Blender salió con 1; faltan .json, .glb, .webp, -hoja.png`;
- `1 fallaron: nino-2`;
- `exit=1`;
- el catálogo sigue con `mujer-eu38 hombre-eu50 nina-8 nino-8`;
- en `.tmp/avatares/hoja.html`, la tarjeta de `nino-2` muestra `no converge: estatura …`.

El `git checkout` devuelve `tallas.json` a lo commiteado en la Tarea 1.

- [ ] **Step 10: Gates y commit (solo el código)**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git status --short
git add scripts/avatares/generar-todas.mjs tests/repo/avatares-generar.test.ts package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(avatares): npm run avatares — paralelo, meshopt, catálogo y hoja de contactos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
Antes del `add`, `git status --short` debe mostrar sin trackear `public/avatares/`, `src/avatares/`, `scripts/avatares/acabado/` y `.maria-avatar.mjs`. Ninguno de los cuatro entra en este commit.

---

### Task 7: Puerta — Samuel revisa una talla por grupo

Esta tarea no lleva código. Nadie sigue a la Tarea 8 sin la respuesta de Samuel.

- [ ] **Step 1: Mandar a Samuel `.tmp/avatares/hoja.png`** con estas preguntas:
  1. ¿Cada cuerpo se ve de su talla y su edad?
  2. ¿Las cintas rojas pasan por donde pasaría la de una patronista? Así están puestas:
     - el cuello va bajo la nuez;
     - el busto, por el ápice;
     - el muslo, justo bajo el pliegue glúteo;
     - de las dos de la cintura, la natural es la **más alta**. Queda a media altura entre la cresta ilíaca y la costilla más baja: en EU 38, a 101,5 cm (ANSUR da 101,2). La otra es la del ombligo, donde miden ANSUR y NHANES.

     El talle trasero de EU 38 (38,2) va de la cervical a esa cintura natural. ANSUR lo mide hasta el ombligo y da 41,5; la tabla de Vina (`gradingSkill.ts:167`) dice 40,5.
  3. `weight` queda en 1,0 desde EU 38 en mujer y desde EU 50 en hombre, y en casi todos los niños. ¿Se ven gordos?
     - La cintura natural de EU 38 mide 77,1, más que los 69–72 de EN 13402. Es la cintura de las mujeres de ANSUR, que son militares: al ombligo miden 79,1.
     - `mujer-eu48` usa 1,98 del tope de 2 en el target de cintura. Está en el borde de lo alcanzable, y cualquier cambio en el acabado puede dejarla sin converger.
  4. ¿Pezones y entrepierna quedan suficientemente alisados?
  5. Algunas medidas no crecen de talla en talla. EU 32 sale de solo 10 personas y queda más alta que EU 34 (159,9 contra 158,7). Lo mismo pasa con la entrepierna y la altura de cintura en varias tallas vecinas, porque así vienen las medianas de ANSUR. ¿Se acepta tal cual, o se suaviza cada medida con una regresión contra el busto?
- [ ] **Step 2: Si algo no convence, cambiar solo su perilla:**

| Qué | Perilla | Archivo |
|---|---|---|
| alisado de pezones y entrepierna | `REGIONES` (radio, iteraciones) | `acabado.py` |
| altura de la cintura natural | `FRACCION_CINTURA` | `medir.py` |
| altura del muslo bajo la horcajadura | `FRACCION_MUSLO` | `medir.py` |
| dónde arranca el talle trasero | `CERVICAL` | `medir.py` |
| qué cintas van horizontales | `HORIZONTALES` | `medir.py` |
| cuánto se estiran los targets | `LIMITE_CONTROL` | `ajuste.py` |
| cuerpo sobre el que se calcula el acabado | `BASES` | `acabado.py` |

Un cambio de perilla lleva la prueba que corresponda, un commit propio y regenerar con `npm run avatares -- --solo …`. Si cambia lo que se ve en la malla o en las medidas, también se sube `GENERADOR` en `generar.py`.
- [ ] **Step 3: Anotar la decisión** como comentario en la PR #1224 antes de seguir.

---

### Task 8: La cabeza lisa (reescrita el 2026-09-30: `cabeza.py`, no escultura a mano)

Samuel pidió que la cabeza la hiciera Claude y no una escultura a mano, así que se reescribió esta tarea. No se esculpe la cabeza original: `scripts/avatares/cabeza.py` la reemplaza en cada avatar.

1. Corta a 0,009 × la estatura sobre el plano del cuello de `medir.py`. Así el cuello y la cervical, donde se mide, no se tocan.
2. Borra lo de arriba: ojos, boca, orejas y sus cavidades.
3. Teje una tapa nueva en 40 anillos, desde el borde del corte hasta la coronilla.
4. Cada punto de la tapa va a la piel más externa de la cabeza original en su dirección. Es un rayo lanzado desde afuera, así que las cavidades quedan fuera.
5. Esa piel se filtra con una mediana por vecindad angular de 28°. Borra nariz, labios y orejas, que ocupan menos de la mitad de la ventana, y conserva mandíbula y mentón. Después se suaviza con una gaussiana de 8° y con Taubin, lo que también disuelve el zigzag del borde.
6. La mediana baja la coronilla entre 5 y 8 mm. Se la devuelve a su altura porque la estatura es una medida ajustada.
7. Los pesos del rig se copian del vértice original más cercano.

`generar.py` llama a `cabeza.py` **después de medir**, porque cambia los vértices, y vuelve a medir solo la estatura. Las 31 regeneradas dan un peor error de estatura de 0,20 cm. El camino de la escultura a mano (`acabado.py --preparar/--guardar-cabeza`) se quitó: la tapa reemplaza la cabeza igual, así que habría quedado como una trampa sin efecto.

Lo que se probó y no sirvió, todo medido el 2026-09-30:
- alisar la malla original: Taubin deja la cara, el laplaciano la encoge y el radial la vuelve bola;
- proyectarla sobre una superficie polinómica: deja pliegues y ondas;
- alisar el radio con un bi-laplaciano: con cualquier intensidad deja a la vista las cavidades de ojos y boca.

La prueba es `cabeza_test.py`, sobre una mujer y un niño de 2 años horneados. Verifica que la malla quede cerrada; que sea lisa (ninguna arista dobla más de 50°, cuando la cabeza original dobla 128° y la esquina mandíbula-cuello, que se conserva, 37°); que el cuello siga intacto; que ningún vértice nuevo quede sin hueso y que la coronilla vaya sobre todo a `Head`; y que la estatura cambie menos de 1 mm. Corre en `npm run avatares -- --probar`.

### Task 9: Las 31, la revisión con María y el commit de lo generado

- [ ] **Step 1: Generar la biblioteca entera**

Run: `npm run avatares`
Esperado, en unos 2 min: 31 líneas `ok`, `catálogo: 31 entradas`, y ninguna FALLA.

- [ ] **Step 2: Revisión de Samuel y de María.** Se prepara la entrega con `.tmp/avatares/hoja.png` según la convención de entregas para María, pidiéndole que mire si cada talla se ve como la talla que ella corta. Sin su aprobación y la de Samuel no se sigue. Si hay cambios, vuelve a la Tarea 7, paso 2.

- [ ] **Step 3: Commit de lo generado, con rutas explícitas**

```bash
git add public/avatares/*.glb public/avatares/*.webp src/avatares/catalogo.json scripts/avatares/acabado/
git diff --cached --stat | tail -3
```
Esperado: 31 `.glb`, 31 `.webp`, `catalogo.json` y 8 `.target` (4 grupos × pezones y entrepierna), unos 8 MB en total. Nada más.
```bash
git commit -m "$(cat <<'EOF'
feat(avatares): las 31 avatares de la biblioteca

Generadas con npm run avatares (generador 1.0.0) desde ANSUR II y NHANES
2021-2023; aprobadas por Samuel y María sobre la hoja de contactos.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Gates, push y PR**

```bash
npx tsc -b --noEmit && npm run test && npm run lint && npm run lint:ui
git push
gh pr edit 1224 --title "feat(avatares): biblioteca de avatares — spec, plan y generador (paso 1)"
```
En la descripción de la PR hay que dejar dos cosas:
- que la app todavía no usa estas avatares (eso es el paso 2, la integración de § 5, que registra `MeshoptDecoder` en los dos `GLTFLoader`);
- los desvíos del spec de este plan.

- [ ] **Step 5: Cierre.** Actualizar la memoria `biblioteca-avatares-estado-2026-09-29` (lo hecho, lo siguiente: el plan de integración § 5 y el contrato v2).
