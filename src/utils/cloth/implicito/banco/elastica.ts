/**
 * La elástica exacta de una tira empotrada que cuelga por su peso: B·θ'' = −w·(L − s)·cos θ, con θ(0) = 0
 * y θ'(L) = 0, resuelta por disparo sobre θ'(0) con un Runge-Kutta de punto medio. B en N·m por metro de
 * ancho, w = peso por área (N/m²) y L en m. Devuelve la punta: x a lo largo, y hacia arriba (negativa).
 */
export function elasticaExacta(B: number, w: number, L: number, pasos = 4000): { x: number; y: number } {
  const integrar = (k0: number) => {
    const ds = L / pasos;
    const f = (s: number, t: number) => (-w * (L - s) * Math.cos(t)) / B;
    let th = 0, k = k0, x = 0, y = 0;
    for (let i = 0; i < pasos; i++) {
      const s = i * ds;
      const k1 = f(s, th), thm = th + 0.5 * ds * k, km = k + 0.5 * ds * k1;
      const k2 = f(s + 0.5 * ds, thm);
      x += ds * Math.cos(thm);
      y -= ds * Math.sin(thm);
      th += ds * km;
      k += ds * k2;
    }
    return { k, x, y };
  };
  let lo = 0, hi = 1;
  while (integrar(hi).k < 0) hi *= 2;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (integrar(mid).k < 0) lo = mid;
    else hi = mid;
  }
  const r = integrar((lo + hi) / 2);
  return { x: r.x, y: r.y };
}
