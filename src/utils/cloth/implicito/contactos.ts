/**
 * El contacto con los obstáculos (spec 2026-10-13 §4.3.1, con la enmienda E10): el cuerpo es un piso duro. El vértice
 * que al empezar el paso está apoyado en el cuerpo (a la separación) queda restringido en la normal del cuerpo, como las
 * restricciones de Baraff y Witkin (*Large Steps in Cloth Simulation*, §5.3): el gradiente conjugado filtra esa
 * componente y el vértice solo se mueve por el plano tangente. La restricción se suelta cuando su fuerza jala hacia el
 * cuerpo. El vértice que el paso mete en el cuerpo sin estar apoyado se proyecta a la separación al terminar el paso,
 * sin velocidad hacia adentro, y queda apoyado el cuadro siguiente. La fricción es la de Coulomb suavizada, linealizada
 * con la fuerza de apoyo y la velocidad del cuadro anterior: un resorte tangencial k_t = μ·λ / (max(|v_t|, ε_v)·h),
 * que sostiene la tela mientras la fuerza tangencial no pase de μ·λ y la deja deslizar con fuerza μ·λ si pasa.
 */

/** Un vértice apoyado en el cuerpo: la normal del cuerpo (afuera) y la rigidez de su fricción. */
export interface ApoyoEnCuerpo {
  i: number;
  nx: number;
  ny: number;
  nz: number;
  /** rigidez tangencial de la fricción (N/m) */
  kt: number;
}

/**
 * Cuánto más allá de la separación sigue apoyado un vértice (m). Restringido, el vértice no se mueve en la normal, y al
 * deslizar sobre un cuerpo convexo se aleja un poco de él: sin esta holgura soltaría y volvería a apoyarse cuadro tras
 * cuadro.
 */
export const HOLGURA_DE_APOYO = 1e-4;

/**
 * La velocidad hacia afuera del cuerpo (m/s) desde la que un vértice que toca el cuerpo se despega en vez de apoyarse:
 * la tela que sale despedida no se queda un cuadro pegada.
 */
export const VELOCIDAD_DE_DESPEGUE = 1e-3;

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

/** ½·kt·|u − (n·u)·n|², con u = x − x_t: la fricción de un apoyo. */
export function energiaDeFriccion(c: ApoyoEnCuerpo, ux: number, uy: number, uz: number): number {
  const un = c.nx * ux + c.ny * uy + c.nz * uz;
  const tx = ux - un * c.nx, ty = uy - un * c.ny, tz = uz - un * c.nz;
  return 0.5 * c.kt * (tx * tx + ty * ty + tz * tz);
}
