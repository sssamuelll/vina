import { describe, it, expect } from 'vitest';
import { resolverRuta } from '../rutas.js';

// dist/ de mentira: solo importa qué existe.
const existe = new Set(['index.html', 'app/index.html', 'assets/index-abc.js', 'wasm/xpbd_wasm_bg.wasm']);
const r = (p: string) => resolverRuta(p, (rel) => existe.has(rel));

describe('resolverRuta', () => {
  it('/ es la home', () => expect(r('/')).toEqual({ tipo: 'archivo', ruta: 'index.html' }));
  it('/app/ es el taller', () => expect(r('/app/')).toEqual({ tipo: 'archivo', ruta: 'app/index.html' }));
  it('/app sin barra redirige', () => expect(r('/app')).toEqual({ tipo: 'redirigir', a: '/app/' }));
  it('una ruta profunda del taller cae en el taller (SPA)', () =>
    expect(r('/app/proyecto/123')).toEqual({ tipo: 'archivo', ruta: 'app/index.html' }));
  it('un asset existente se sirve tal cual', () =>
    expect(r('/assets/index-abc.js')).toEqual({ tipo: 'archivo', ruta: 'assets/index-abc.js' }));
  it('un asset que falta es 404, no un index', () => expect(r('/assets/nope.js')).toEqual({ tipo: 'no-encontrado' }));
  it('una ruta desconocida fuera de /app/ es 404', () => expect(r('/algo')).toEqual({ tipo: 'no-encontrado' }));
  it('no escapa de dist con ..', () => expect(r('/../package.json')).toEqual({ tipo: 'no-encontrado' }));
  it('un pathname mal codificado es 404, no una excepción que tumba el servidor', () =>
    expect(r('/%E0%A4%A')).toEqual({ tipo: 'no-encontrado' }));
  // En Windows path.join trata `\` como separador: `%5C..` escaparía de dist
  // aunque la normalización posix no lo vea. El fs real diría que sí existe.
  it('no escapa de dist con barras invertidas codificadas', () =>
    expect(resolverRuta('/assets%5C..%5C..%5Cpackage.json', () => true)).toEqual({ tipo: 'no-encontrado' }));
});
