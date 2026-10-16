/**
 * La tela contra sí misma en la GPU (spec 2026-10-13 §4.3.2, con E3 y E6): el mismo armado de pares que sistema.ts,
 * armarParesPropios. Una rejilla de puntos por hash espacial (contar, sumar, repartir; las atómicas solo cuentan) y
 * cada triángulo recorre las celdas de su caja agrandada por el radio. Los pares van a una lista, y cada vértice tiene,
 * rearmada en cada cuadro, la lista de sus entradas en los pares: la recorren el residuo, el producto matriz-vector y
 * el bloque diagonal (§4.3.2). Un par ocupa 14 números en tf: los cuatro vértices (−1 si no hay), sus pesos, la normal,
 * p0, kt y si está activo.
 */

/** Suma exclusiva de `largo` cuentas del búfer `at` (desde `cuenta`) a tf (desde `salida`, como f32 exactos), con el total al final. */
export function wgslScan(nombre: string, cuenta: string, largo: string, salida: string): string {
  return /* wgsl */ `@compute @workgroup_size(WG) fn ${nombre}Bloques(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  var v = 0u;
  if (g.x < ${largo}) { v = atomicLoad(&at[${cuenta} + g.x]); }
  shu[l.x] = v;
  workgroupBarrier();
  for (var paso = 1u; paso < WG; paso = paso * 2u) {
    var s = 0u;
    if (l.x >= paso) { s = shu[l.x - paso]; }
    workgroupBarrier();
    shu[l.x] = shu[l.x] + s;
    workgroupBarrier();
  }
  if (g.x < ${largo}) { tf[${salida} + g.x] = f32(shu[l.x] - v); }
  if (l.x == WG - 1u) { tf[O_SCB + w.x] = f32(shu[l.x]); }
}
@compute @workgroup_size(1) fn ${nombre}Totales() {
  var s = 0.0;
  for (var k = 0u; k < (${largo} + WG - 1u) / WG; k++) {
    let t = tf[O_SCB + k];
    tf[O_SCB + k] = s;
    s = s + t;
  }
  tf[${salida} + ${largo}] = s;
}
@compute @workgroup_size(WG) fn ${nombre}Sumar(@builtin(global_invocation_id) g: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (g.x >= ${largo}) { return; }
  tf[${salida} + g.x] = tf[${salida} + g.x] + tf[O_SCB + w.x];
}`;
}

/** Las funciones y entradas del contacto propio; se escriben siempre, porque el motor crea una tubería por entrada. */
export function wgslPropio(): string {
  return /* wgsl */ `var<workgroup> shu: array<u32, WG>;

fn celdaDe(p: vec3<f32>, c: f32) -> vec3<i32> { return vec3<i32>(floor(p / c)); }
fn hashCelda(k: vec3<i32>) -> u32 {
  let u = bitcast<vec3<u32>>(k);
  return ((u.x * 73856093u) ^ (u.y * 19349663u) ^ (u.z * 83492791u)) & (NCELDAS - 1u);
}
fn puntoDe(p: u32) -> vec3<f32> {
  if (p < N) { return ldx(p); }
  return v3tf(O_CUV + 3u * (p - N));
}
fn nPares() -> u32 { return min(atomicLoad(&at[A_NPAR]), MAXP); }

// 4c. el radio de búsqueda y la celda del cuadro (sistema.ts, armarParesPropios)
@compute @workgroup_size(WG) fn velMax(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  var v = 0.0;
  if (g.x < N) { v = length(ld(O_V, g.x)); }
  let m = reducirMax(l.x, v);
  if (l.x == 0u) { red[R_PB + w.x] = m; }
}

@compute @workgroup_size(1) fn armarRadio() {
  var vmax = 0.0;
  for (var k = 0u; k < GV; k++) { vmax = max(vmax, red[R_PB + k]); }
  let r = SEPP + min(ALCANCE, 2.0 * vmax * H + abs(GRAV) * H * H);
  red[R_SC + E_RADIO] = r;
  // la celda mide al menos el radio: la caja de un triángulo toca a lo sumo cinco celdas por eje
  red[R_SC + E_CELDA] = max(max(2.0 * SEPP, ARISTA), r);
  atomicStore(&at[A_NPAR], 0u);
}

// 4d. la rejilla de puntos
@compute @workgroup_size(WG) fn limpiarCeldas(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= NCELDAS) { return; }
  atomicStore(&at[A_CNTC + g.x], 0u);
  atomicStore(&at[A_CURC + g.x], 0u);
}

@compute @workgroup_size(WG) fn hashContar(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = g.x;
  if (p >= NP) { return; }
  let h = hashCelda(celdaDe(puntoDe(p), red[R_SC + E_CELDA]));
  tf[O_HP + p] = f32(h);
  atomicAdd(&at[A_CNTC + h], 1u);
}

${wgslScan('scanC', 'A_CNTC', 'NCELDAS', 'O_OFFC')}

@compute @workgroup_size(WG) fn hashLlenar(@builtin(global_invocation_id) g: vec3<u32>) {
  let p = g.x;
  if (p >= NP) { return; }
  let h = u32(tf[O_HP + p]);
  tf[O_ORD + u32(tf[O_OFFC + h]) + atomicAdd(&at[A_CURC + h], 1u)] = f32(p);
}

// 4e. los pares
fn excluido(i: u32, v: u32) -> bool {
  for (var k = iu[I_EXO + i]; k < iu[I_EXO + i + 1u]; k++) { if (iu[I_EXI + k] == v) { return true; } }
  return false;
}

// E6: el punto cae sobre la cara cerrada si su separación del punto más cercano va a lo largo de la normal de la cara,
// con 1/1000 de tolerancia (entra el que cae justo sobre un borde o un vértice; el vecino de canto, no)
fn sobreLaCara(e: vec3<f32>, tn: vec3<f32>) -> bool {
  let e2 = dot(e, e);
  let en = dot(e, tn);
  return e2 - en * en / dot(tn, tn) <= 1e-6 * e2;
}

// la separación de p a su punto más cercano de la cara, relativa a a: q = a + wb·(b − a) + wc·(c − a). Restar posiciones
// absolutas lejos del origen (la tela sobre el torso, a 1,4 m) pierde en precisión simple las micras que E6 compara
fn sepDeCara(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, w: vec3<f32>) -> vec3<f32> {
  return (p - a) - w.y * (b - a) - w.z * (c - a);
}

fn guardarPar(v: vec4<f32>, w: vec4<f32>, n: vec3<f32>, p0: f32, kt: f32) {
  let k = atomicAdd(&at[A_NPAR], 1u);
  if (k >= MAXP) {
    atomicAdd(&at[A_DESB], 1u);
    return;
  }
  let o = O_PAR + 14u * k;
  tf[o] = v.x; tf[o + 1u] = v.y; tf[o + 2u] = v.z; tf[o + 3u] = v.w;
  tf[o + 4u] = w.x; tf[o + 5u] = w.y; tf[o + 6u] = w.z; tf[o + 7u] = w.w;
  tf[o + 8u] = n.x; tf[o + 9u] = n.y; tf[o + 10u] = n.z;
  tf[o + 11u] = p0;
  tf[o + 12u] = kt;
  tf[o + 13u] = select(0.0, 1.0, p0 > 0.0);
}

// un vértice libre de tela contra la cara (ia, ib, ic): solo si cae sobre ella (E6), a menos del radio
fn parDeVertice(i: u32, ia: u32, ib: u32, ic: u32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, tn: vec3<f32>, xi: vec3<f32>, r: f32) {
  if (iu[I_FIJO + i] != 0u || excluido(i, ia) || excluido(i, ib) || excluido(i, ic)) { return; }
  let e = puntoMasCercano(xi, a, b, c);
  let dv = sepDeCara(xi, a, b, c, e.w);
  let d = length(dv);
  if (d >= r || d < 1e-9 || !sobreLaCara(dv, tn)) { return; }
  let n = dv / d;
  let p0 = SEPP - d;
  var kt = 0.0;
  if (p0 > 0.0) {
    let vr = ld(O_V, i) - e.w.x * ld(O_V, ia) - e.w.y * ld(O_V, ib) - e.w.z * ld(O_V, ic);
    kt = rigidez(MU_T, KC * p0, tangencial(vr, n));
  }
  guardarPar(vec4<f32>(f32(i), f32(ia), f32(ib), f32(ic)), vec4<f32>(1.0, -e.w.x, -e.w.y, -e.w.z), n, p0, kt);
}

// 1 = ese vértice del cuerpo sostenía la tela: el arreglo de este cuadro y el del anterior se alternan por paridad
fn sostiene(b: u32, este: bool) -> u32 {
  let par = u32(red[R_SC + E_CUADRO]) & 1u;
  let cual = select(1u - par, par, este);
  return O_SOST + cual * NVB + b;
}

@compute @workgroup_size(WG) fn limpiarPuntas(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= NVB) { return; }
  tf[sostiene(g.x, true)] = 0.0;
}

// un vértice del cuerpo contra la cara (ia, ib, ic): cae sobre ella (E6) y la atravesó o la sostenía el cuadro anterior (R13)
fn parDePunta(b: u32, ia: u32, ib: u32, ic: u32, a: vec3<f32>, bb: vec3<f32>, c: vec3<f32>, tn: vec3<f32>, y: vec3<f32>, r: f32, libres: bool) {
  if (!libres) { return; }
  let e = puntoMasCercano(y, a, bb, c);
  let dv = sepDeCara(y, a, bb, c, e.w);
  if (length(dv) >= r || !sobreLaCara(dv, tn)) { return; }
  let nn = v3tf(O_CUVN + 3u * b);
  let s0 = -dot(nn, dv);
  if (!(s0 < 0.0 || (tf[sostiene(b, false)] > 0.5 && s0 < SEP))) { return; }
  tf[sostiene(b, true)] = 1.0;
  let p0 = SEP - s0;
  let vr = e.w.x * ld(O_V, ia) + e.w.y * ld(O_V, ib) + e.w.z * ld(O_V, ic);
  // tela contra cuerpo: la fricción del cuerpo (§4.3.1)
  let kt = rigidez(MU_C, KC * p0, tangencial(vr, nn));
  guardarPar(vec4<f32>(f32(ia), f32(ib), f32(ic), -1.0), vec4<f32>(e.w, 0.0), nn, p0, kt);
}

@compute @workgroup_size(WG) fn paresDeTriangulo(@builtin(global_invocation_id) g: vec3<u32>) {
  let t = g.x;
  if (t >= NT) { return; }
  let ia = iu[I_TRIS + 3u * t];
  let ib = iu[I_TRIS + 3u * t + 1u];
  let ic = iu[I_TRIS + 3u * t + 2u];
  let a = ldx(ia);
  let b = ldx(ib);
  let c = ldx(ic);
  let tn = cross(b - a, c - a);
  let r = red[R_SC + E_RADIO];
  let cel = red[R_SC + E_CELDA];
  let libres = iu[I_FIJO + ia] == 0u || iu[I_FIJO + ib] == 0u || iu[I_FIJO + ic] == 0u;
  let k0 = celdaDe(min(min(a, b), c) - vec3<f32>(r), cel);
  let k1 = celdaDe(max(max(a, b), c) + vec3<f32>(r), cel);
  // ponytail: un triángulo estirado más allá de ocho celdas por eje no busca pares y se cuenta como desborde
  if (any(k1 - k0 >= vec3<i32>(8))) {
    atomicAdd(&at[A_DESB], 1u);
    return;
  }
  for (var kx = k0.x; kx <= k1.x; kx++) {
    for (var ky = k0.y; ky <= k1.y; ky++) {
      for (var kz = k0.z; kz <= k1.z; kz++) {
        let k = vec3<i32>(kx, ky, kz);
        let h = hashCelda(k);
        let fin = u32(tf[O_OFFC + h + 1u]);
        for (var s = u32(tf[O_OFFC + h]); s < fin; s++) {
          let p = u32(tf[O_ORD + s]);
          let q = puntoDe(p);
          // la misma entrada del hash guarda puntos de otras celdas: cada punto se mira desde la suya
          if (any(celdaDe(q, cel) != k)) { continue; }
          if (p < N) { parDeVertice(p, ia, ib, ic, a, b, c, tn, q, r); }
          else { parDePunta(p - N, ia, ib, ic, a, b, c, tn, q, r, libres); }
        }
      }
    }
  }
}

// 4f. la lista de entradas de cada vértice en los pares
@compute @workgroup_size(WG) fn limpiarVertices(@builtin(global_invocation_id) g: vec3<u32>) {
  if (g.x >= N) { return; }
  atomicStore(&at[A_CNTV + g.x], 0u);
  atomicStore(&at[A_CURV + g.x], 0u);
}

@compute @workgroup_size(WG) fn contarEntradas(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= nPares()) { return; }
  for (var j = 0u; j < 4u; j++) {
    let v = tf[O_PAR + 14u * k + j];
    if (v >= 0.0) { atomicAdd(&at[A_CNTV + u32(v)], 1u); }
  }
}

${wgslScan('scanV', 'A_CNTV', 'N', 'O_OFFV')}

@compute @workgroup_size(WG) fn llenarEntradas(@builtin(global_invocation_id) g: vec3<u32>) {
  let k = g.x;
  if (k >= nPares()) { return; }
  for (var j = 0u; j < 4u; j++) {
    let v = tf[O_PAR + 14u * k + j];
    if (v < 0.0) { continue; }
    let vi = u32(v);
    tf[O_ENT + u32(tf[O_OFFV + vi]) + atomicAdd(&at[A_CURV + vi], 1u)] = f32(4u * k + j);
  }
}

// 8b. los pares que el paso cruzaría, medidos sobre su plano fijo (sistema.ts, anticiparContactos)
@compute @workgroup_size(WG) fn anticiparPares(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  let k = g.x;
  var nuevo = 0.0;
  if (k < nPares()) {
    let o = O_PAR + 14u * k;
    if (tf[o + 13u] < 0.5) {
      let nn = v3tf(o + 8u);
      var un = 0.0;
      for (var j = 0u; j < 4u; j++) {
        let v = tf[o + j];
        if (v >= 0.0) { un += tf[o + 4u + j] * dot(nn, ld(O_DX, u32(v))); }
      }
      if (tf[o + 11u] - un > 0.0) {
        tf[o + 13u] = 1.0;
        nuevo = 1.0;
      }
    }
  }
  let total = reducirSuma(l.x, nuevo);
  if (l.x == 0u) { red[R_PE + w.x] = total; }
}

// 9b. la energía de los pares activos en la búsqueda en línea (contactoPropio.ts, energiaDelPar)
@compute @workgroup_size(WG) fn difPares(@builtin(global_invocation_id) g: vec3<u32>, @builtin(local_invocation_id) l: vec3<u32>, @builtin(workgroup_id) w: vec3<u32>) {
  if (!bandera(l.x, E_PROBANDO)) { return; }
  let k = g.x;
  var de = 0.0;
  if (k < nPares()) {
    let o = O_PAR + 14u * k;
    if (tf[o + 13u] > 0.5) {
      var U = vec3<f32>(0.0);
      for (var j = 0u; j < 4u; j++) {
        let v = tf[o + j];
        // U = Σ w·α·Δ, sin restar posiciones (en precisión simple, x_p − x_t pierde dígitos)
        if (v >= 0.0) { U += tf[o + 4u + j] * red[R_SC + E_ALFA_LS] * ld(O_DX, u32(v)); }
      }
      let nn = v3tf(o + 8u);
      let p0 = tf[o + 11u];
      let un = dot(nn, U);
      let p = p0 - un;
      let tt = U - un * nn;
      var e = 0.5 * tf[o + 12u] * dot(tt, tt);
      if (p > 0.0) { e += 0.5 * KC * p * p; }
      var e0 = 0.0;
      if (p0 > 0.0) { e0 = 0.5 * KC * p0 * p0; }
      de = e - e0;
    }
  }
  let total = reducirSuma(l.x, de);
  if (l.x == 0u) { red[R_PE + w.x] = total; }
}`;
}
