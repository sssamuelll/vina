"""La cabeza de maniquí (spec § 4.2): lisa, sin ojos, boca ni orejas marcadas; cuello limpio.

No se esculpe la cabeza original: se reemplaza. Se corta un poco por encima del plano del cuello de
medir.py, se borra lo de arriba (ojos, boca, orejas y sus cavidades) y se teje una tapa nueva en anillos,
desde ese borde hasta la coronilla. Cada punto de la tapa va a la piel más externa de la cabeza original
en su dirección (un rayo desde afuera, así que las cavidades quedan fuera), filtrada con una mediana por
vecindad angular (borra nariz, labios y orejas, que ocupan menos de la mitad de la ventana, y conserva
mandíbula y mentón) y suavizada.

Alisar la malla original no sirvió (medido el 2026-09-30): Taubin deja la cara, el laplaciano la encoge
hacia el cuello, el alisado radial la vuelve una bola, y los tres dejan a la vista las cavidades de ojos
y boca. Corre sobre la malla ya horneada y después de medir, porque cambia los vértices.
"""
import math
import os
import sys

import bmesh
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medir  # noqa: E402

# Perillas: se juzgan mirando la hoja de contactos.
CORTE = 0.009       # sobre el plano del cuello, en fracción de la estatura: cuello y cervical quedan intactos
ANILLOS = 40
MEDIANA = 28        # grados: la ventana que borra nariz, labios y orejas
SUAVIZADO = 8       # grados: sigma del suavizado gaussiano posterior
COSTURA = 6         # anillos en los que la tapa pasa de la piel real a la superficie suave
FIJO = 0.005        # m sobre el plano del cuello: de ahí para abajo nada se mueve
TAUBIN = 30         # pasadas del alisado final de la tapa, con el borde fijo


def _suave(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def _slerp(a, b, t):
    om = math.acos(max(-1.0, min(1.0, a.dot(b))))
    if om < 1e-6:
        return a.copy()
    return (a * math.sin((1 - t) * om) + b * math.sin(t * om)) / math.sin(om)


def _lazo(borde):
    """Los vértices del borde del corte, en orden."""
    vecinos = {}
    for e in borde:
        a, b = e.verts
        vecinos.setdefault(a, []).append(b)
        vecinos.setdefault(b, []).append(a)
    if any(len(v) != 2 for v in vecinos.values()):
        raise RuntimeError('el borde del corte de la cabeza no es un lazo simple')
    lazo, previo = [next(iter(vecinos))], None
    while True:
        siguiente = [w for w in vecinos[lazo[-1]] if w is not previo][0]
        if siguiente is lazo[0]:
            return lazo
        previo = lazo[-1]
        lazo.append(siguiente)


def _radios(dirs, crudo):
    """Mediana y suavizado gaussiano del radio, por vecindad angular real (no por índice de la grilla)."""
    kd = kdtree.KDTree(len(dirs))
    for j, d in enumerate(dirs):
        kd.insert(Vector(d), j)
    kd.balance()
    cuerda = lambda grados: 2 * math.sin(math.radians(grados) / 2)
    med = np.array([np.median(crudo[[j for _, j, _ in kd.find_range(Vector(d), cuerda(MEDIANA))]]) for d in dirs])
    lis = np.empty_like(med)
    for j, d in enumerate(dirs):
        ids = np.array([q for _, q, _ in kd.find_range(Vector(d), cuerda(2.5 * SUAVIZADO))])
        ang = np.arccos(np.clip(dirs[ids] @ dirs[j], -1, 1))
        w = np.exp(-(ang / math.radians(SUAVIZADO)) ** 2 / 2)
        lis[j] = (w * med[ids]).sum() / w.sum()
    return lis


def cabeza_de_maniqui(obj):
    """Reemplaza la cabeza de la malla de `obj` por la de maniquí. Devuelve un informe."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    co = [v.co.copy() for v in bm.verts]
    cc, n = medir.plano_de_lazo(co, medir.LAZOS['cuello'])
    if n.z < 0:
        n = -n
    corte = CORTE * (max(c.z for c in co) - min(c.z for c in co))
    region = [f for f in bm.faces if (f.calc_center_median() - cc).dot(n) > corte]
    en_region = set(region)
    lazo = _lazo([e for e in bm.edges if sum(f in en_region for f in e.link_faces) == 1])
    vreg = list({v for f in region for v in f.verts})
    borde = set(lazo)
    interior = np.array([tuple(v.co) for v in vreg if v not in borde])
    caja = Vector(((interior.min(axis=0) + interior.max(axis=0)) / 2).tolist())
    # sobre el eje del cuello: desde ahí el borde da la vuelta en orden y los meridianos no se cruzan
    centro = cc + n * (caja - cc).dot(n)
    polo = (Vector(max(interior, key=lambda p: (Vector(p) - centro).dot(n))) - centro).normalized()
    cima_z = float(interior[:, 2].max())                              # la coronilla original: fija la estatura
    cima_n = max((Vector(p) - cc).dot(n) for p in interior)
    indice = {v: k for k, v in enumerate(vreg)}
    bvh = BVHTree.FromPolygons([tuple(v.co) for v in vreg], [[indice[v] for v in f.verts] for f in region])

    # la grilla de direcciones: meridianos del borde (con puntos medios) a la coronilla
    ub = [(v.co - centro).normalized() for v in lazo]
    m = len(lazo)
    base = []
    for i in range(m):
        base += [ub[i], _slerp(ub[i], ub[(i + 1) % m], 0.5).normalized()]
    grilla = [[_slerp(d, polo, k / ANILLOS).normalized() for d in base] for k in range(1, ANILLOS)]
    dirs = np.array([tuple(d) for fila in grilla for d in fila])
    crudo = np.array([((bvh.ray_cast(centro + Vector(d), -Vector(d))[0] or centro) - centro).length for d in dirs])
    crudo = np.where(crudo > 0, crudo, np.median(crudo))
    lis = _radios(dirs, crudo).reshape(len(grilla), -1)
    crudo = crudo.reshape(len(grilla), -1)
    for k in range(len(grilla)):  # cerca del cuello manda la piel real, para empalmar sin escalón
        t = _suave(k / COSTURA)
        lis[k] = crudo[k] * (1 - t) + lis[k] * t

    # pesos del rig: los del vértice original más cercano
    dl = bm.verts.layers.deform.active
    kd = kdtree.KDTree(len(vreg))
    for k, v in enumerate(vreg):
        kd.insert(v.co, k)
    kd.balance()
    pesos = [dict(v[dl]) for v in vreg]
    posiciones = [[centro + d * float(lis[k, i]) for i, d in enumerate(fila)] for k, fila in enumerate(grilla)]
    punta = centro + polo * float(np.median(lis[-1]))

    bmesh.ops.delete(bm, geom=region, context='FACES')
    nuevos = []

    def nuevo(p):
        v = bm.verts.new(p)
        nuevos.append(v)
        return v
    filas = [[nuevo(p) for p in fila] for fila in posiciones]
    vpunta = nuevo(punta)
    caras = []
    for i in range(m):  # del borde (m) al primer anillo (2m)
        b0, b1 = lazo[i], lazo[(i + 1) % m]
        a0, a1, a2 = filas[0][2 * i], filas[0][2 * i + 1], filas[0][(2 * i + 2) % (2 * m)]
        caras += [(b0, a0, a1), (b0, a1, b1), (b1, a1, a2)]
    for f0, f1 in zip(filas, filas[1:]):
        caras += [(f0[i], f0[(i + 1) % (2 * m)], f1[(i + 1) % (2 * m)], f1[i]) for i in range(2 * m)]
    caras += [(filas[-1][i], filas[-1][(i + 1) % (2 * m)], vpunta) for i in range(2 * m)]
    nuevas = [bm.faces.new(c) for c in caras]
    for f in nuevas:
        f.smooth = True

    # alisado final (Taubin: alisa sin encoger) de la tapa y de la banda original entre el plano del
    # cuello y el corte, que disuelve el zigzag del borde; el plano, donde se mide el cuello, no se toca
    banda = [v for v in bm.verts if v not in set(nuevos) and FIJO < (v.co - cc).dot(n)]
    vecinos = {v: {e.other_vert(v) for e in v.link_edges} for v in nuevos + banda}
    for _ in range(TAUBIN):
        for factor in (0.5, -0.53):
            destino = {v: v.co + factor * (sum((w.co for w in ws), Vector()) / len(ws) - v.co) for v, ws in vecinos.items()}
            for v, p in destino.items():
                v.co = p
    # la mediana y el suavizado bajan la coronilla (5 a 8 mm medidos) y la estatura es una medida ajustada:
    # se sube la tapa, más cuanto más arriba, hasta devolverla a su altura
    delta = cima_z - max(v.co.z for v in nuevos)
    for v in nuevos:
        v.co.z += delta * _suave(((v.co - cc).dot(n) - corte) / (cima_n - corte))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    uv = bm.loops.layers.uv.active
    for f in nuevas:
        f.material_index = 0
        if uv:
            for lp in f.loops:
                lp[uv].uv = (0.5, 0.5)  # la textura es un gris plano: cualquier punto sirve
    for v in nuevos:
        for g, peso in pesos[kd.find(v.co)[1]].items():
            v[dl][g] = peso
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    return {'lazo': m, 'anillos': ANILLOS, 'vertices_nuevos': len(nuevos), 'caras_nuevas': len(nuevas)}
