import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * El candado de la máquina (`scripts/pesado.mjs`).
 *
 * Es un detector de colisiones, y uno que se equivoca es peor que ninguno: si
 * deja pasar a dos a la vez volvemos a los ensayos tumbados por sobrecarga; si
 * se queda con la máquina cuando el dueño muere, deja a todos esperando a nadie.
 * Así que van las dos caras: que pare al segundo y que suelte al muerto.
 *
 * Cada caso usa su propio puerto libre (`VINA_PESADO_PUERTO`), no el de verdad,
 * y quita `VINA_PESADO` del entorno: este archivo corre dentro de `npm run test`,
 * o sea dentro del candado real, y heredaría su contraseña.
 */

const RAIZ = process.cwd();
const PESADO = join(RAIZ, 'scripts', 'pesado.mjs');
const DORMIR = join(RAIZ, 'tests', 'repo', 'fixtures', 'candado', 'dormir.mjs');
const ANIDAR = join(RAIZ, 'tests', 'repo', 'fixtures', 'candado', 'anidar.mjs');
/** EX_TEMPFAIL: no falló la orden, la máquina no estaba disponible. */
const OCUPADA = 75;

const q = (ruta: string) => `"${ruta}"`;

function entorno(puerto: number): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    VINA_PESADO_PUERTO: String(puerto),
    VINA_PESADO_SONDEO_MS: '100',
    VINA_PESADO_MUESTRA_MS: '50',
  };
  delete env.VINA_PESADO;
  delete env.VINA_PESADO_OMITIR;
  delete env.VINA_SESION;
  return env;
}

function puertoLibre(): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const s = net.createServer();
    s.once('error', rechazar);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolver(port));
    });
  });
}

let dir = '';
const vivos: ChildProcess[] = [];

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'vina-candado-')); });
afterEach(() => {
  for (const p of vivos.splice(0)) {
    if (p.pid === undefined || p.exitCode !== null) continue;
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
    else p.kill('SIGKILL');
  }
  rmSync(dir, { recursive: true, force: true });
});

/** Corre `pesado` y espera. Bloquea este proceso: no sirve si el test debe atender sockets. */
function pesado(puerto: number, args: string[]) {
  return spawnSync(process.execPath, [PESADO, ...args], { env: entorno(puerto), encoding: 'utf8', timeout: 20_000 });
}

/** Lo mismo sin bloquear, para el caso que necesita este proceso libre. */
function pesadoAsync(puerto: number, args: string[]): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolver) => {
    const p = spawn(process.execPath, [PESADO, ...args], { env: entorno(puerto), stdio: ['ignore', 'ignore', 'pipe'] });
    vivos.push(p);
    let stderr = '';
    p.stderr?.on('data', (d) => { stderr += d; });
    p.on('exit', (status) => resolver({ status, stderr }));
  });
}

/** Deja a `pesado` sosteniendo la máquina `ms` milisegundos con una orden de juguete. */
function sostener(puerto: number, nombre: string, ms: number, marca: string): ChildProcess {
  const p = spawn(
    process.execPath,
    [PESADO, '--sin-admision', `--nombre=${nombre}`, '--', 'node', q(DORMIR), String(ms), q(marca)],
    { env: entorno(puerto), stdio: 'ignore' },
  );
  vivos.push(p);
  return p;
}

async function esperarHasta(cond: () => boolean, ms = 10_000): Promise<void> {
  const limite = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > limite) throw new Error('esperarHasta: no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 100));
  }
}

const vivo = (pid: number) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

describe('el candado de la máquina', () => {
  it('corre la orden, devuelve su código y suelta el candado aunque falle', async () => {
    const puerto = await puertoLibre();
    const marca = join(dir, 'a');
    const r = pesado(puerto, ['--sin-admision', '--', 'node', q(DORMIR), '0', q(marca), '3']);
    expect(r.status).toBe(3);
    expect(existsSync(marca)).toBe(true);
    expect(r.stderr).toContain('tomó la máquina');
    const e = pesado(puerto, ['--estado']);
    expect(e.status).toBe(0);
    expect(e.stdout).toContain('libre');
  });

  it('no arranca encima del trabajo de otro, y dice de quién es', async () => {
    const puerto = await puertoLibre();
    const marcaA = join(dir, 'a');
    const marcaB = join(dir, 'b');
    sostener(puerto, 'ensayo-de-juguete', 20_000, marcaA);
    await esperarHasta(() => existsSync(marcaA));

    const r = pesado(puerto, ['--sin-admision', '--espera=0', '--', 'node', q(DORMIR), '0', q(marcaB)]);
    expect(r.status).toBe(OCUPADA);
    expect(r.stderr).toContain('ensayo-de-juguete');
    expect(existsSync(marcaB)).toBe(false);

    const e = pesado(puerto, ['--estado']);
    expect(e.status).toBe(OCUPADA);
    expect(e.stdout).toContain('ensayo-de-juguete');
  });

  it('hace cola y corre cuando el otro termina', async () => {
    const puerto = await puertoLibre();
    const marcaA = join(dir, 'a');
    const marcaB = join(dir, 'b');
    sostener(puerto, 'primero', 1_500, marcaA);
    await esperarHasta(() => existsSync(marcaA));

    const b = pesadoAsync(puerto, ['--sin-admision', '--espera=1', '--', 'node', q(DORMIR), '0', q(marcaB)]);
    await new Promise((r) => setTimeout(r, 600));
    expect(existsSync(marcaB), 'B arrancó con A todavía dentro').toBe(false);

    const { status, stderr } = await b;
    expect(status).toBe(0);
    expect(existsSync(marcaB)).toBe(true);
    expect(stderr).toContain('primero');
  });

  it('si matan al dueño, la máquina queda libre en el acto: no hay plazo que esperar', async () => {
    const puerto = await puertoLibre();
    const marca = join(dir, 'a');
    const dueno = sostener(puerto, 'dueno', 60_000, marca);
    await esperarHasta(() => existsSync(marca));
    const pidDeLaOrden = Number(readFileSync(marca, 'utf8'));
    expect(pesado(puerto, ['--estado']).status).toBe(OCUPADA);

    dueno.kill();
    await esperarHasta(() => pesado(puerto, ['--estado']).status === 0);

    // En Windows la orden queda huérfana y viva (límite conocido, ver el encabezado
    // de pesado.mjs): aquí se la limpia para no dejarla corriendo tras el test.
    if (vivo(pidDeLaOrden)) process.kill(pidDeLaOrden);
  }, 30_000);

  it('una orden que ya corre dentro del candado no se bloquea al pedirlo otra vez', async () => {
    const puerto = await puertoLibre();
    const marca = join(dir, 'anidada');
    const r = pesado(puerto, ['--sin-admision', '--', 'node', q(ANIDAR), q(PESADO), q(DORMIR), q(marca)]);
    expect(r.status).toBe(0);
    expect(existsSync(marca), 'la orden anidada no corrió: pidió el candado a su propio dueño').toBe(true);
  });

  it('no arranca con la máquina cargada, dice por qué y no se queda con el candado', async () => {
    const puerto = await puertoLibre();
    const marca = join(dir, 'a');
    const orden = ['--', 'node', q(DORMIR), '0', q(marca)];

    const sinMemoria = pesado(puerto, ['--espera=0', '--ram=100000', ...orden]);
    expect(sinMemoria.status).toBe(OCUPADA);
    expect(sinMemoria.stderr).toContain('memoria libre');

    const sinCpu = pesado(puerto, ['--espera=0', '--cpu=-1', ...orden]);
    expect(sinCpu.status).toBe(OCUPADA);
    expect(sinCpu.stderr).toContain('CPU');
    expect(existsSync(marca)).toBe(false);

    expect(pesado(puerto, ['--estado']).status, 'el rechazo dejó el candado tomado').toBe(0);

    const saltada = pesado(puerto, ['--sin-admision', '--ram=100000', '--cpu=-1', ...orden]);
    expect(saltada.status).toBe(0);
    expect(existsSync(marca)).toBe(true);
  });

  it('si el puerto lo tiene algo que no es pesado, lo dice y no corre', async () => {
    const puerto = await puertoLibre();
    const marca = join(dir, 'a');
    const intruso = net.createServer((c) => c.end('hola'));
    await new Promise<void>((ok) => intruso.listen(puerto, '127.0.0.1', ok));
    try {
      const r = await pesadoAsync(puerto, ['--sin-admision', '--espera=0', '--', 'node', q(DORMIR), '0', q(marca)]);
      expect(r.status).toBe(OCUPADA);
      expect(r.stderr).toContain('no es pesado');
      expect(existsSync(marca)).toBe(false);
    } finally {
      await new Promise((ok) => intruso.close(ok));
    }
  });
});

describe('todo lo pesado pide el candado', () => {
  const paquete = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

  it.each(['test', 'test:coverage', 'test:e2e', 'build'])('`npm run %s` pasa por scripts/pesado.mjs', (nombre) => {
    expect(paquete.scripts[nombre]).toMatch(/^node scripts\/pesado\.mjs /);
  });

  it('el ensayo y el deploy se vuelven a lanzar dentro del candado, y solo una vez', () => {
    const guion = readFileSync(join(RAIZ, 'scripts', 'deploy-prod.sh'), 'utf8');
    expect(guion).toMatch(/exec node scripts\/pesado\.mjs .*deploy-prod\.sh/);
    expect(guion).toContain('[ -z "${VINA_PESADO:-}" ]');
  });
});
