import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { abrirPanel } from './helpers/estados';

interface Estado {
  simulation: { armAxis: { ready: boolean; left: [number, number, number] | null } };
  project: { avatarModelUrl: string };
}
interface VentanaConStore {
  __VINA_STORE__?: { getState: () => Estado; dispatch: (a: unknown) => void };
}

// 3D en SwiftShader: el goto, el arranque del renderer y la GLB no caben en los 30 s de la config.
test.setTimeout(90_000);

const estado = (page: Page) => page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__!.getState());

/** El esqueleto que se ve: la altura de la cabeza y si algún hueso quedó estirado. */
const esqueleto = (page: Page) => page.evaluate(() => {
  interface Hueso { name: string; scale: { toArray(): number[] }; position: { constructor: new () => { x: number; y: number; z: number } };
    updateWorldMatrix(p: boolean, c: boolean): void; getWorldPosition<T>(v: T): T }
  const escena = (document.querySelector('.viewport3d') as unknown as { __scene?: { traverse(cb: (o: { uuid: string; isSkinnedMesh?: boolean; skeleton?: { bones: Hueso[] } }) => void): void } }).__scene;
  let huesos: Hueso[] = [];
  let malla = '';
  escena?.traverse((o) => { if (o.isSkinnedMesh && !huesos.length && o.skeleton) { huesos = o.skeleton.bones; malla = o.uuid; } });
  const cabeza = huesos.find((b) => b.name === 'Head');
  const hips = huesos.find((b) => b.name === 'Hips');
  if (!cabeza || !hips) return null;
  const mundo = (b: Hueso) => { b.updateWorldMatrix(true, false); return b.getWorldPosition(new b.position.constructor()); };
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const c = mundo(hips);
  return {
    malla,
    cabeza: r(mundo(cabeza).y),
    cadera: [r(c.x), r(c.y), r(c.z)],
    sinEstirar: huesos.every((b) => b.scale.toArray().every((s) => Math.abs(s - 1) < 1e-6)),
  };
});

async function esperarCuerpo(page: Page) {
  await page.waitForFunction(
    () => (window as unknown as VentanaConStore).__VINA_STORE__?.getState().simulation.armAxis.ready === true,
    null, { timeout: 60_000 },
  );
}

/** Spec 2026-09-29 § 5 y § 9: un proyecto nuevo pide mujer-eu38.glb y nunca default-avatar.glb. */
test('un proyecto nuevo abre con Mujer EU 38, sin estirar, en A-pose, y el panel dice qué cuerpo es', async ({ page }) => {
  const pedidos: string[] = [];
  page.on('request', (r) => pedidos.push(new URL(r.url()).pathname));
  const errores: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });

  await page.goto('/app/');
  // AvatarModel despacha armAxis.ready al encontrar los huesos: la GLB comprimida se decodificó.
  await esperarCuerpo(page);
  expect((await estado(page)).project.avatarModelUrl).toBe('/avatares/mujer-eu38.glb');
  expect(errores.filter((e) => /meshopt|GLTFLoader|AvatarModel/i.test(e))).toEqual([]);

  // A-pose resuelta para ESTE esqueleto: brazo recto a 45° en el plano frontal. Con la preset
  // del escaneo quedaba a 58° y 19° hacia delante: eje (0,41, −0,85, 0,33).
  await expect.poll(async () => {
    const eje = (await estado(page)).simulation.armAxis.left!;
    return [eje[0], eje[1], eje[2]].map((v) => Math.round(v * 20) / 20);
  }, { timeout: 10_000 }).toEqual([0.7, -0.7, 0]);

  // El cuerpo de la biblioteca no se estira: la cabeza a su altura de la GLB (1,431 m) y ningún
  // hueso escalado, ni al arrancar ni después de editar medidas, que van al patrón.
  // Y en su sitio: la cadera donde la deja el generador (nodo Hips de la GLB), sin recentrar por la
  // caja, que es como la lee también la colisión por URL.
  const antes = await esqueleto(page);
  const glbAntes = pedidos.filter((p) => p === '/avatares/mujer-eu38.glb').length;
  expect(antes).toMatchObject({
    cabeza: expect.closeTo(1.431, 2),
    cadera: [expect.closeTo(0.004, 2), expect.closeTo(0.899, 2), expect.closeTo(0.025, 2)],
    sinEstirar: true,
  });
  await page.evaluate(() => (window as unknown as VentanaConStore).__VINA_STORE__!.dispatch(
    { type: 'project/updateMeasurements', payload: { height: 190, chest: 70, shoulder: 50, armLength: 70 } },
  ));
  await page.waitForTimeout(800);
  expect(await esqueleto(page)).toEqual(antes);
  // Ni se vuelve a bajar: antes, cambiar la estatura re-importaba la GLB (efecto [url, height]).
  expect(pedidos.filter((p) => p === '/avatares/mujer-eu38.glb')).toHaveLength(glbAntes);

  await abrirPanel(page, 'Avatar y medidas', 'Avatar');
  await expect(page.locator('.ap-model-info').getByText('Mujer EU 38 · US 8', { exact: true })).toBeVisible();
  await expect(page.getByText('El cuerpo es la talla Mujer EU 38 · US 8; tus cambios se usan en el patrón.')).toBeVisible();
  expect(pedidos.filter((p) => p.includes('default-avatar'))).toEqual([]);
});

test('un modelo propio subido desde el panel carga y no se estira al subirlo', async ({ page }) => {
  const errores: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto('/app/');
  await esperarCuerpo(page);
  await abrirPanel(page, 'Avatar y medidas', 'Avatar');
  const antes = (await esqueleto(page))!.malla;

  // Una GLB con esqueleto Mixamo, subida como la subiría María (el input del panel). Ojo: escalada a
  // la estatura del proyecto, su cabeza cae casi a la misma altura que la de la EU 38; lo que prueba
  // que cargó es que la malla es otra.
  await page.locator('.avatar-panel input[type="file"]').setInputFiles(path.resolve('public/avatares/hombre-eu50.glb'));
  await expect.poll(async () => (await estado(page)).project.avatarModelUrl, { timeout: 10_000 }).toMatch(/^blob:/);
  await expect.poll(async () => (await esqueleto(page))?.malla, { timeout: 30_000 }).not.toBe(antes);

  expect(errores.filter((e) => /Failed to load mesh|Unsupported|unknown/i.test(e))).toEqual([]);
  expect((await esqueleto(page))?.sinEstirar).toBe(true);
  await expect(page.locator('.ap-model-info').getByText('hombre-eu50.glb', { exact: true })).toBeVisible();
});
