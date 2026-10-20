// pesado.mjs — el candado de la máquina para lo pesado (2026-10-10).
//
// La máquina es una sola y la comparten varias sesiones de Claude y las
// aplicaciones de Samuel. Hasta hoy se cuidaba por mensajes («voy a correr la
// suite, no corras nada»), que dependen de que el otro los lea a tiempo. Y tres
// ensayos seguidos de la #1241 murieron por sobrecarga, cada uno por una causa
// distinta: la memoria (Claude Code corta lo de fondo con 3,5 GB libres),
// Ableton y Blender con la CPU al 100 %, y la suite misma, con 23 workers en 24
// CPU lógicas.
//
// Uso:
//   node scripts/pesado.mjs [banderas] -- <orden…>   corre la orden con la máquina tomada
//   node scripts/pesado.mjs --estado                 quién la tiene, memoria libre y CPU
//                                                    (sale 0 si está libre, 75 si no)
//
// Banderas:
//   --nombre=<texto>   cómo se presenta ante los demás (por defecto, la orden)
//   --espera=<min>     cuánto hace cola si está ocupada (10 por defecto; 0 para parar al instante)
//   --ram=<GB>         memoria libre mínima para arrancar (4)
//   --cpu=<%>          CPU ocupada máxima para arrancar (70)
//   --sin-admision     salta lo de memoria y CPU; solo si Samuel lo pide
//
// El candado es un puerto de loopback: quien lo escucha tiene la máquina, y a
// quien llega el dueño le contesta con un JSON que dice quién es. Se eligió sobre
// un archivo con latido porque lo arbitra el sistema operativo: si el dueño
// muere, de la forma que sea, el puerto queda libre en el acto, sin plazos que
// esperar ni candados rancios que robar a medias. Y un puerto es de la máquina
// entera: otro proyecto que copie este script coopera con el mismo número.
//
// Además del turno pide cupo: no arranca con poca memoria libre ni con la CPU
// ocupada por otras aplicaciones, y espera diciendo por qué. Eso cubre también a
// quien lanzó trabajo sin pasar por aquí.
//
// Una orden que ya corre dentro del candado no lo pide otra vez: el dueño deja su
// contraseña en VINA_PESADO. VINA_PESADO_OMITIR=1 lo salta entero; es de Samuel.
//
// Si matan al dueño, el puerto se libera en el acto. Lo que no se libera solo es
// la orden: en Windows, matar a `pesado` sin su árbol (`taskkill` sin /T) deja a
// la orden huérfana y viva (medido el 10-10: el `cmd.exe` de en medio muere y
// el resto sigue). No se arregla aquí; lo ve la admisión, por la CPU. Lo normal es
// lo contrario: parar la tarea de un agente mata el shell de arriba y deja vivo
// a `pesado`, que sigue corriendo la orden y con el candado puesto, a la vista en
// `--estado`.
//
// Lo que NO cubre: a quien no pase por aquí (un `npx vitest run` suelto a toda la
// suite), y las aplicaciones ajenas, que la admisión solo ve de lejos. Medido el
// 10-10: Blender renderizando se llevaba 16 núcleos y Ableton 2,5; ahí ninguna
// herramienta de agentes sobra, y lo que hace es esperar y decir por qué.
import net from 'node:net';
import os from 'node:os';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';

const HOST = '127.0.0.1';
const PUERTO = Number(process.env.VINA_PESADO_PUERTO ?? 41847);
const SONDEO_MS = Number(process.env.VINA_PESADO_SONDEO_MS ?? 2000);
const MUESTRA_MS = Number(process.env.VINA_PESADO_MUESTRA_MS ?? 1000);
/** EX_TEMPFAIL: la orden no falló, la máquina no estaba disponible. */
const OCUPADA = 75;
const PUERTO_RESERVADO = 78;

class Parar extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const coma = (n) => n.toFixed(1).replace('.', ',');
const hora = (iso) => new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
const minutos = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));

function leerArgumentos(argv) {
  const a = { espera: 10, nombre: null, ram: 4, cpu: 70, sinAdmision: false, estado: false, comando: [] };
  const corte = argv.indexOf('--');
  const banderas = corte === -1 ? argv : argv.slice(0, corte);
  a.comando = corte === -1 ? [] : argv.slice(corte + 1);
  for (const b of banderas) {
    if (b === '--estado') a.estado = true;
    else if (b === '--sin-admision') a.sinAdmision = true;
    else if (b.startsWith('--nombre=')) a.nombre = b.slice('--nombre='.length);
    else if (b.startsWith('--espera=')) a.espera = Number(b.slice('--espera='.length));
    else if (b.startsWith('--ram=')) a.ram = Number(b.slice('--ram='.length));
    else if (b.startsWith('--cpu=')) a.cpu = Number(b.slice('--cpu='.length));
    else throw new Parar(2, `✗ pesado: no conozco la bandera ${b}`);
  }
  if ([a.espera, a.ram, a.cpu].some(Number.isNaN)) throw new Parar(2, '✗ pesado: --espera, --ram y --cpu piden un número');
  return a;
}

/** Quién tiene el puerto: su JSON, `null` si nadie, `{ desconocido }` si es algo que no es pesado. */
function leerDueno() {
  return new Promise((resolver) => {
    const s = net.connect({ port: PUERTO, host: HOST });
    let datos = '';
    const fin = (v) => { s.destroy(); resolver(v); };
    s.setTimeout(1_500, () => fin({ desconocido: true }));
    s.on('data', (d) => { datos += d; });
    s.on('end', () => {
      try { fin(JSON.parse(datos)); } catch { fin({ desconocido: true }); }
    });
    s.on('error', (e) => fin(e.code === 'ECONNREFUSED' ? null : { desconocido: true }));
  });
}

function escuchar(info) {
  return new Promise((resolver, rechazar) => {
    const s = net.createServer((c) => c.end(JSON.stringify(info)));
    s.once('error', rechazar);
    s.listen({ port: PUERTO, host: HOST, exclusive: true }, () => {
      s.removeListener('error', rechazar);
      s.on('error', () => {});
      resolver(s);
    });
  });
}

function quienLaTiene(d) {
  if (d?.desconocido) {
    return `un proceso que no es pesado tiene el puerto ${PUERTO} (míralo con: netstat -ano | findstr :${PUERTO})`;
  }
  return `«${d.sesion}» corre «${d.nombre}» desde las ${hora(d.desde)} (lleva ${minutos(d.desde)} min, pid ${d.pid})`;
}

async function tomar(info, hasta) {
  let ultimoAviso = 0;
  let sinRespuesta = 0;
  for (;;) {
    try {
      return await escuchar(info);
    } catch (e) {
      if (e.code === 'EACCES') {
        throw new Parar(PUERTO_RESERVADO, `✗ pesado: Windows no deja usar el puerto ${PUERTO} (rango reservado). Define VINA_PESADO_PUERTO con otro, el mismo en todas las sesiones.`);
      }
      if (e.code !== 'EADDRINUSE') throw e;
    }
    const dueno = await leerDueno();
    if (dueno === null) {
      // Lo soltaron entre el intento y la lectura: se reintenta ya. Si el puerto
      // sigue tomado y nadie contesta, no es un dueño, es otra cosa.
      if (++sinRespuesta > 20) {
        throw new Parar(OCUPADA, `✗ pesado: el puerto ${PUERTO} está tomado y nadie contesta (míralo con: netstat -ano | findstr :${PUERTO}).`);
      }
      await dormir(50);
      continue;
    }
    sinRespuesta = 0;
    if (Date.now() >= hasta) {
      throw new Parar(OCUPADA, dueno.desconocido
        ? `✗ pesado: ${quienLaTiene(dueno)}. Ciérralo o define VINA_PESADO_PUERTO con otro.`
        : `✗ pesado: la máquina está ocupada: ${quienLaTiene(dueno)}.\n  No arranco encima de su trabajo. Espera a que termine, o haz cola con --espera=<minutos>.`);
    }
    if (Date.now() - ultimoAviso > 30_000) {
      console.error(`pesado: ${quienLaTiene(dueno)}. Hago cola.`);
      ultimoAviso = Date.now();
    }
    await dormir(SONDEO_MS);
  }
}

const tiempos = () => os.cpus().reduce(
  (t, c) => ({ libre: t.libre + c.times.idle, total: t.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }),
  { libre: 0, total: 0 },
);

async function carga() {
  const antes = tiempos();
  await dormir(MUESTRA_MS);
  const despues = tiempos();
  const total = despues.total - antes.total;
  const cpu = total > 0 ? 100 * (1 - (despues.libre - antes.libre) / total) : 0;
  return { libreGB: os.freemem() / 2 ** 30, cpu };
}

async function admitir(a, hasta) {
  let ultimoAviso = 0;
  for (;;) {
    const { libreGB, cpu } = await carga();
    const motivos = [];
    if (libreGB < a.ram) motivos.push(`memoria libre ${coma(libreGB)} GB (mínimo ${a.ram})`);
    if (cpu > a.cpu) motivos.push(`CPU al ${Math.round(cpu)} % (máximo ${a.cpu})`);
    if (motivos.length === 0) return;
    if (Date.now() >= hasta) {
      throw new Parar(OCUPADA, `✗ pesado: otras aplicaciones tienen la máquina cargada: ${motivos.join(', ')}.\n  Ciérralas o espera; con --espera=<minutos> hago cola. --sin-admision lo salta, y solo si Samuel lo pide.`);
    }
    if (Date.now() - ultimoAviso > 30_000) {
      console.error(`pesado: máquina cargada (${motivos.join(', ')}). Espero.`);
      ultimoAviso = Date.now();
    }
    await dormir(SONDEO_MS);
  }
}

function matarArbol(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(pid, 'SIGTERM');
}

/** Los argumentos van al shell tal cual: quien los escribe se encarga de las comillas. */
function correr(comando, contrasena) {
  return new Promise((resolver) => {
    const hijo = spawn(comando.join(' '), { stdio: 'inherit', shell: true, env: { ...process.env, VINA_PESADO: contrasena } });
    const senales = ['SIGINT', 'SIGTERM', 'SIGHUP'];
    const cortar = () => matarArbol(hijo.pid);
    for (const s of senales) process.once(s, cortar);
    hijo.on('error', (e) => {
      console.error(`✗ pesado: no pude lanzar «${comando.join(' ')}»: ${e.message}`);
      resolver(127);
    });
    hijo.on('exit', (codigo, senal) => {
      for (const s of senales) process.removeListener(s, cortar);
      resolver(codigo ?? (senal ? 143 : 1));
    });
  });
}

async function estado() {
  const dueno = await leerDueno();
  const { libreGB, cpu } = await carga();
  const maquina = `Memoria libre ${coma(libreGB)} GB, CPU al ${Math.round(cpu)} %.`;
  if (dueno === null) {
    console.log(`libre. ${maquina}`);
    return 0;
  }
  console.log(`ocupada: ${quienLaTiene(dueno)}. ${maquina}`);
  if (!dueno.desconocido) {
    console.log(`Si es un resto que nadie vigila, solo Samuel decide pararlo: taskkill /F /T /PID ${dueno.pid}`);
  }
  return OCUPADA;
}

async function main() {
  const a = leerArgumentos(process.argv.slice(2));
  if (a.estado) return estado();
  if (a.comando.length === 0) {
    throw new Parar(2, '✗ pesado: falta la orden. Uso: node scripts/pesado.mjs [--espera=<min>] [--nombre=<texto>] -- <orden…>   |   --estado');
  }

  // Dentro de un trabajo que ya tiene la máquina no se pide otra vez.
  const contrasena = process.env.VINA_PESADO;
  if (process.env.VINA_PESADO_OMITIR === '1' || contrasena === 'omitido') return correr(a.comando, 'omitido');
  if (contrasena) {
    const dueno = await leerDueno();
    if (dueno && dueno.token === contrasena) return correr(a.comando, contrasena);
  }

  const orden = a.comando.join(' ');
  const info = {
    token: randomUUID(),
    sesion: process.env.VINA_SESION || basename(process.cwd()),
    nombre: a.nombre || orden,
    orden,
    pid: process.pid,
    desde: new Date().toISOString(),
  };
  const hasta = Date.now() + a.espera * 60_000;
  const servidor = await tomar(info, hasta);
  try {
    if (!a.sinAdmision) await admitir(a, hasta);
    console.error(`pesado: «${info.nombre}» tomó la máquina (sesión ${info.sesion})`);
    return await correr(a.comando, info.token);
  } finally {
    servidor.close();
    servidor.closeAllConnections?.();
  }
}

main().then(
  (codigo) => { process.exitCode = codigo; },
  (e) => {
    console.error(e instanceof Parar ? e.message : e.stack);
    process.exitCode = e instanceof Parar ? e.codigo : 1;
  },
);
