/**
 * El contacto con los obstáculos (spec 2026-10-13 §4.2.1 y §4.3.1, con la decisión E4 del plan de la entrega
 * 4): cada vértice en contacto se apoya en el plano tangente al obstáculo en su punto más cercano, fijado al
 * empezar el paso o al anticiparlo. La solución usa el plano de dos lados; la búsqueda en línea, la misma energía
 * de un solo lado, sin consultar el obstáculo. La fricción es la de Coulomb suavizada, linealizada con la normal
 * y la velocidad del cuadro anterior: un resorte tangencial k_t = μ·λ / (max(|v_t|, ε_v)·h), que sostiene la
 * tela mientras la fuerza tangencial no pase de μ·λ y la deja deslizar con fuerza μ·λ si pasa.
 */

/** Un vértice apoyado en un plano: su normal (afuera) y su penetración al empezar el paso. */
export interface PlanoDeContacto {
  i: number;
  nx: number;
  ny: number;
  nz: number;
  /** sep − n·(x_t − c): mayor que 0 dentro de la separación */
  p0: number;
  /** rigidez tangencial de la fricción (N/m); 0 en un contacto anticipado */
  kt: number;
}

/**
 * La velocidad (m/s) bajo la cual la fricción sostiene, como ε_v en IPC (Li et al., «Incremental Potential
 * Contact», SIGGRAPH 2020). Por debajo de ella la tela quieta se arrastra a ε_v·tanθ/μ en una pendiente θ; para
 * que una prenda apoyada pase la quietud (0,1 % de g·h ≈ 0,16 mm/s, quietud.ts) en cualquier pendiente hasta el
 * ángulo de fricción, ε_v no puede pasar de 0,16 mm/s. Con el 1 mm/s de IPC, una tela a 15° se arrastraba a
 * 0,67 mm/s y no quedaba quieta nunca.
 */
export const EPS_FRICCION = 1e-4;

/** k_t de un contacto con normal λ (N) que el cuadro anterior movía a vt (m/s) por el plano. */
export function rigidezDeFriccion(mu: number, lambda: number, vt: number, h: number): number {
  return mu > 0 && lambda > 0 ? (mu * lambda) / (Math.max(vt, EPS_FRICCION) * h) : 0;
}

/** ½·kc·max(p0 − n·u, 0)² + ½·kt·|u − (n·u)·n|², con u = x − x_t: el plano en la búsqueda en línea. */
export function energiaDePlano(c: PlanoDeContacto, kc: number, ux: number, uy: number, uz: number): number {
  const un = c.nx * ux + c.ny * uy + c.nz * uz, p = c.p0 - un;
  const tx = ux - un * c.nx, ty = uy - un * c.ny, tz = uz - un * c.nz;
  return (p > 0 ? 0.5 * kc * p * p : 0) + 0.5 * c.kt * (tx * tx + ty * ty + tz * tz);
}
