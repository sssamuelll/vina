/**
 * El cuerpo en la GPU (spec 2026-10-13 §4.3.1): el punto más cercano de un triángulo (Ericson, «Real-Time Collision
 * Detection», §5.1.5, como cuerpo.ts) y el recorrido del BVH del cuerpo sin pila, por sus punteros de escape, como
 * CuerpoRigido.cercano. Lee las zonas CUN (nodos), CUT (triángulos), CUNT (normales de cara), CUPA y CUPV
 * (pseudonormales de arista y de vértice) de tf, y CUS (escapes) de iu.
 */

/** `puntoMasCercano(p, a, b, c)`: el punto, sus pesos y el rasgo (0 cara; 1, 2, 3 aristas AB, BC, CA; 4, 5, 6 vértices A, B, C). */
export function wgslPuntoMasCercano(): string {
  return /* wgsl */ `struct EnTri { q: vec3<f32>, w: vec3<f32>, rasgo: u32 }
fn enTri(w: vec3<f32>, rasgo: u32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> EnTri { return EnTri(w.x * a + w.y * b + w.z * c, w, rasgo); }
fn puntoMasCercano(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>) -> EnTri {
  let ab = b - a;
  let ac = c - a;
  let ap = p - a;
  let d1 = dot(ab, ap);
  let d2 = dot(ac, ap);
  if (d1 <= 0.0 && d2 <= 0.0) { return enTri(vec3<f32>(1.0, 0.0, 0.0), 4u, a, b, c); }
  let bp = p - b;
  let d3 = dot(ab, bp);
  let d4 = dot(ac, bp);
  if (d3 >= 0.0 && d4 <= d3) { return enTri(vec3<f32>(0.0, 1.0, 0.0), 5u, a, b, c); }
  let vc = d1 * d4 - d3 * d2;
  if (vc <= 0.0 && d1 >= 0.0 && d3 <= 0.0) { let v = d1 / (d1 - d3); return enTri(vec3<f32>(1.0 - v, v, 0.0), 1u, a, b, c); }
  let cp = p - c;
  let d5 = dot(ab, cp);
  let d6 = dot(ac, cp);
  if (d6 >= 0.0 && d5 <= d6) { return enTri(vec3<f32>(0.0, 0.0, 1.0), 6u, a, b, c); }
  let vb = d5 * d2 - d1 * d6;
  if (vb <= 0.0 && d2 >= 0.0 && d6 <= 0.0) { let w = d2 / (d2 - d6); return enTri(vec3<f32>(1.0 - w, 0.0, w), 3u, a, b, c); }
  let va = d3 * d6 - d5 * d4;
  if (va <= 0.0 && d4 - d3 >= 0.0 && d5 - d6 >= 0.0) { let w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return enTri(vec3<f32>(0.0, 1.0 - w, w), 2u, a, b, c); }
  let den = va + vb + vc;
  if (!(abs(den) > 0.0)) { return enTri(vec3<f32>(1.0, 0.0, 0.0), 4u, a, b, c); }
  let v = vb / den;
  let w = vc / den;
  return enTri(vec3<f32>(1.0 - v - w, v, w), 0u, a, b, c);
}`;
}

/** `cuerpoCercano(p, radio)`: (d con signo, normal del plano) del punto del cuerpo más cercano, o (1e30, 0, 1, 0). */
export function wgslCuerpoCercano(): string {
  return /* wgsl */ `fn v3tf(o: u32) -> vec3<f32> { return vec3<f32>(tf[o], tf[o + 1u], tf[o + 2u]); }
fn cuerpoCercano(p: vec3<f32>, radio: f32) -> vec4<f32> {
  var mejor2 = radio * radio;
  var mejor = NINGUNA;
  var rasgo = 0u;
  var q = vec3<f32>(0.0);
  var i = 0u;
  loop {
    if (i >= NCU) { break; }
    let o = O_CUN + 8u * i;
    let dd = max(max(v3tf(o) - p, vec3<f32>(0.0)), p - v3tf(o + 3u));
    if (dot(dd, dd) >= mejor2) {
      i = iu[I_CUS + i];
      continue;
    }
    let cuenta = u32(tf[o + 7u]);
    if (cuenta == 0u) {
      i = i + 1u;
      continue;
    }
    let t0 = u32(tf[o + 6u]);
    for (var t = t0; t < t0 + cuenta; t++) {
      let b = O_CUT + 9u * t;
      let r = puntoMasCercano(p, v3tf(b), v3tf(b + 3u), v3tf(b + 6u));
      let e = p - r.q;
      let d2 = dot(e, e);
      if (d2 < mejor2) {
        mejor2 = d2;
        mejor = t;
        rasgo = r.rasgo;
        q = r.q;
      }
    }
    i = iu[I_CUS + i];
  }
  if (mejor == NINGUNA) { return vec4<f32>(1e30, 0.0, 1.0, 0.0); }
  // la pseudonormal de la característica donde cayó el punto decide el lado (cuerpo.ts)
  var fuente = v3tf(O_CUNT + 3u * mejor);
  if (rasgo >= 1u && rasgo <= 3u) { fuente = v3tf(O_CUPA + 9u * mejor + 3u * (rasgo - 1u)); }
  if (rasgo >= 4u) { fuente = v3tf(O_CUPV + 9u * mejor + 3u * (rasgo - 4u)); }
  let e = p - q;
  let dist = sqrt(mejor2);
  var signo = 1.0;
  if (dot(e, fuente) < 0.0) { signo = -1.0; }
  var n = fuente;
  if (dist > 1e-9) { n = signo * e / dist; }
  return vec4<f32>(signo * dist, n);
}`;
}
