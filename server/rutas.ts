import path from 'node:path';

export type Ruta =
  | { tipo: 'archivo'; ruta: string }
  | { tipo: 'redirigir'; a: string }
  | { tipo: 'no-encontrado' };

/** Qué servir de dist/ para un pathname. `/` es la home; bajo `/app/` el
 *  fallback SPA es el taller; fuera de ahí, lo que no existe es 404. */
export function resolverRuta(pathname: string, existe: (rel: string) => boolean): Ruta {
  let decodificado: string;
  try { decodificado = decodeURIComponent(pathname); } catch { return { tipo: 'no-encontrado' }; }
  // `\` es separador para path.join en Windows y NUL tumba fs: ninguno pertenece a una URL de dist/.
  if (/[\\\0]/.test(decodificado)) return { tipo: 'no-encontrado' };
  const rel = path.posix.normalize(decodificado).replace(/^\/+/, '');
  if (rel.startsWith('..')) return { tipo: 'no-encontrado' };
  if (rel === '') return { tipo: 'archivo', ruta: 'index.html' };
  if (rel === 'app') return { tipo: 'redirigir', a: '/app/' };
  if (rel.startsWith('app/')) {
    return rel !== 'app/' && existe(rel) ? { tipo: 'archivo', ruta: rel } : { tipo: 'archivo', ruta: 'app/index.html' };
  }
  return existe(rel) ? { tipo: 'archivo', ruta: rel } : { tipo: 'no-encontrado' };
}
