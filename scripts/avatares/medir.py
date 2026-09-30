"""Las 15 medidas sobre la malla del avatar, en cm (spec § 3.2 y § 4.3 paso 7).

Circunferencia = perímetro de la envolvente convexa del corte de la malla con un plano, tomando
solo el anillo más cercano al punto de referencia: así mide una cinta, que salta las concavidades
y no abraza el brazo. Longitud = recorrido sobre la superficie o recta entre puntos de la
superficie, según la medida.

Dónde pasa la cinta lo dicen los lazos de vértices de la malla base hm08, los mismos que usa
MakeHuman para sus targets measure-* (makehuman/plugins/0_modeling_a_measurement.py, clase Ruler;
se toman los índices, que son un dato de la malla, no código de MakeHuman, que es AGPL).
Todos los cuerpos de MPFB comparten esa topología, así que un índice es el mismo punto anatómico
en la mujer EU 48 y en el niño de 2 años. Solo se usan los índices del cuerpo (0..13379): los
ayudantes van después y el modificador de máscara no cambia el orden de los que quedan.

Ejes de MPFB: z arriba, -y adelante, +x a la izquierda del avatar.
"""
import heapq
import math

import bmesh
import mathutils.geometry as G
import numpy as np
from mathutils import Vector

N_CUERPO = 13380

LAZOS = {
    'cuello': [7514, 10358, 7631, 7496, 7488, 7489, 7474, 7475, 7531, 7537, 7543, 7549, 7555, 7561, 7743, 7722, 856, 1030, 1051, 850, 844, 838, 832, 826, 820, 756, 755, 770, 769, 777, 929, 3690, 804, 800, 808, 801, 799, 803, 7513, 7515, 7521, 7514],
    'biceps': [8383, 8393, 8392, 8391, 8390, 8394, 8395, 8399, 10455, 10516, 8396, 8397, 8398, 8388, 8387, 8386, 10431, 8385, 8384, 8389],
    'busto': [8439, 8455, 8462, 8446, 8478, 8494, 8557, 8510, 8526, 8542, 10720, 10601, 10603, 10602, 10612, 10611, 10610, 10613, 10604, 10605, 10606, 3942, 3941, 3940, 3950, 3947, 3948, 3949, 3938, 3939, 3937, 4065, 1870, 1854, 1838, 1885, 1822, 1806, 1774, 1790, 1783, 1767, 1799, 8471],
    'bajo_busto': [10750, 10744, 10724, 10725, 10748, 10722, 10640, 10642, 10641, 10651, 10650, 10649, 10652, 10643, 10644, 10645, 10646, 10647, 10648, 3988, 3987, 3986, 3985, 3984, 3983, 3982, 3992, 3989, 3990, 3991, 3980, 3981, 3979, 4067, 4098, 4073, 4072, 4094, 4100, 4082, 4088, 4088],
    'cintura_ombligo': [4121, 10760, 10757, 10777, 10776, 10779, 10780, 10778, 10781, 10771, 10773, 10772, 10775, 10774, 10814, 10834, 10816, 10817, 10818, 10819, 10820, 10821, 4181, 4180, 4179, 4178, 4177, 4176, 4175, 4196, 4173, 4131, 4132, 4129, 4130, 4128, 4138, 4135, 4137, 4136, 4133, 4134, 4108, 4113, 4118, 4121],
    'cadera': [4341, 10968, 10969, 10971, 10970, 10967, 10928, 10927, 10925, 10926, 10923, 10924, 10868, 10875, 10861, 10862, 4228, 4227, 4226, 4242, 4234, 4294, 4293, 4296, 4295, 4297, 4298, 4342, 4345, 4346, 4344, 4343, 4361, 4341],
    'muslo': [11071, 11080, 11081, 11086, 11076, 11077, 11074, 11075, 11072, 11073, 11069, 11070, 11087, 11085, 11084, 12994, 11083, 11082, 11079, 11071],
    'rodilla': [11223, 11230, 11232, 11233, 11238, 11228, 11229, 11226, 11227, 11224, 11225, 11221, 11222, 11239, 11237, 11236, 13002, 11235, 11234, 11223],
}
# Horizontales como las mide ISO 8559-1 de pie. Cuello y bíceps (el brazo va en A, a unos 45°): la
# cinta sigue el plano del lazo, perpendicular al miembro.
HORIZONTALES = {'busto', 'bajo_busto', 'cintura_ombligo', 'cadera', 'muslo', 'rodilla'}
ACROMION, ACROMION_DER = 8274, 1602  # izquierdo y su espejo (data/mesh_metadata/hm08.mirror)
CODO, MUNECA = 10037, 10548          # MakeHuman: upperarm-length [8274, 10037], lowerarm-length [10040, 10548]
PASO_CINTURA = 0.005                 # m: barrido de la cintura natural


def _cm(m):
    return m * 100.0


def cortar(bm, punto, normal):
    """Anillos del corte de la malla con el plano: lista de listas de puntos (Vector)."""
    bm = bm.copy()
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=punto, plane_no=normal)
    aristas = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    padre = {}

    def raiz(a):
        while padre.setdefault(a, a) != a:
            padre[a] = padre[padre[a]]
            a = padre[a]
        return a
    for e in aristas:
        padre[raiz(e.verts[0].index)] = raiz(e.verts[1].index)
    comps = {}
    for e in aristas:
        for v in e.verts:
            comps.setdefault(raiz(v.index), {})[v.index] = v.co.copy()
    bm.free()
    return [list(c.values()) for c in comps.values()]


def casco(puntos, normal):
    """Los puntos de la envolvente convexa, en orden, vistos sobre el plano de normal `normal`."""
    n = Vector(normal).normalized()
    u = n.orthogonal().normalized()
    v = n.cross(u)
    return [puntos[i] for i in G.convex_hull_2d([(p.dot(u), p.dot(v)) for p in puntos])]


def anillo(bm, punto, normal, cerca, con_casco=False):
    """Circunferencia (cm) del anillo del corte más cercano a `cerca`, como una cinta; con_casco
    devuelve además los puntos de la cinta (para dibujarla)."""
    anillos = [a for a in cortar(bm, punto, normal) if len(a) >= 3]
    if not anillos:
        raise ValueError(f'el plano en {tuple(punto)} no corta la malla')
    mejor = min(anillos, key=lambda a: (sum(a, Vector()) / len(a) - Vector(cerca)).length)
    h = casco(mejor, normal)
    cm = _cm(sum((h[i] - h[i - 1]).length for i in range(len(h))))
    return (cm, h) if con_casco else cm


def plano_de_lazo(co, lazo):
    """Centro y normal del plano que mejor ajusta a los vértices del lazo."""
    pts = np.array([tuple(co[i]) for i in dict.fromkeys(lazo)])
    centro = pts.mean(axis=0)
    normal = np.linalg.svd(pts - centro)[2][2]
    return Vector(centro), Vector(normal).normalized()


def cinta(bm, co, nombre, z=None, con_casco=False):
    """Circunferencia (cm) en el lazo `nombre`; con `z`, horizontal a esa altura."""
    centro, normal = plano_de_lazo(co, LAZOS[nombre])
    if z is not None or nombre in HORIZONTALES:
        punto = Vector((centro.x, centro.y, centro.z if z is None else z))
        return anillo(bm, punto, (0, 0, 1), punto, con_casco)
    return anillo(bm, centro, normal, centro, con_casco)


def recorrido(bm, punto, normal, desde, hasta):
    """Largo (cm) del camino más corto entre dos puntos siguiendo el corte de la malla con el plano."""
    bm = bm.copy()
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=punto, plane_no=normal)
    vecinos = {}
    for e in r['geom_cut']:
        if isinstance(e, bmesh.types.BMEdge):
            a, b = e.verts
            d = (a.co - b.co).length
            vecinos.setdefault(a.index, []).append((b.index, d))
            vecinos.setdefault(b.index, []).append((a.index, d))
    co = {v.index: v.co.copy() for v in bm.verts if v.index in vecinos}
    bm.free()
    ini = min(co, key=lambda i: (co[i] - Vector(desde)).length)
    fin = min(co, key=lambda i: (co[i] - Vector(hasta)).length)
    dist = {ini: 0.0}
    cola = [(0.0, ini)]
    while cola:
        d, i = heapq.heappop(cola)
        if i == fin:
            return _cm(d)
        if d > dist.get(i, math.inf):
            continue
        for j, w in vecinos[i]:
            if d + w < dist.get(j, math.inf):
                dist[j] = d + w
                heapq.heappush(cola, (d + w, j))
    raise ValueError('los puntos no están en el mismo contorno del corte')


def coordenadas(bm):
    bm.verts.ensure_lookup_table()
    if len(bm.verts) != N_CUERPO:
        raise ValueError(f'la malla tiene {len(bm.verts)} vértices; se esperaba solo el cuerpo ({N_CUERPO})')
    return [v.co.copy() for v in bm.verts]


def medidas_ajustables(bm):
    """Las que el generador ajusta a los datos (spec § 3.4); cintura_ombligo es la de ANSUR/NHANES."""
    co = coordenadas(bm)
    z0 = min(c.z for c in co)
    sagital = cortar(bm, (0, 0, 0), (1, 0, 0))
    horcajadura = min((p for a in sagital for p in a), key=lambda p: p.z)
    return {
        'estatura': _cm(max(c.z for c in co) - z0),
        'busto': cinta(bm, co, 'busto'),
        'cintura_ombligo': cinta(bm, co, 'cintura_ombligo'),
        'cadera': cinta(bm, co, 'cadera'),
        'cuello': cinta(bm, co, 'cuello'),
        'hombros': _cm((co[ACROMION] - co[ACROMION_DER]).length),
        'largo_brazo': _cm((co[ACROMION] - co[CODO]).length + (co[CODO] - co[MUNECA]).length),
        'entrepierna': _cm(horcajadura.z - z0),
    }


def cintura_natural(bm, co):
    """La circunferencia horizontal mínima entre el lazo de la cintura (ombligo) y el bajo busto."""
    z_ombligo = plano_de_lazo(co, LAZOS['cintura_ombligo'])[0].z
    z_bajo = plano_de_lazo(co, LAZOS['bajo_busto'])[0].z
    alturas = [z_ombligo + k * PASO_CINTURA for k in range(int((z_bajo - z_ombligo) / PASO_CINTURA) + 1)]
    return min((cinta(bm, co, 'cintura_ombligo', z), z) for z in alturas)


def punto_sagital(sagital, z, signo):
    """Punto del contorno sagital (x = 0) a la altura z: delante (signo -1) o detrás (+1)."""
    cerca = [p for a in sagital for p in a if abs(p.z - z) < 0.01]
    return max(cerca, key=lambda p: signo * p.y)


def medidas(bm):
    """Las 15 del catálogo, en cm, sin redondear."""
    co = coordenadas(bm)
    z0 = min(c.z for c in co)
    m = medidas_ajustables(bm)
    cintura, z_cintura = cintura_natural(bm, co)
    sagital = cortar(bm, (0, 0, 0), (1, 0, 0))
    delante, detras = punto_sagital(sagital, z_cintura, -1), punto_sagital(sagital, z_cintura, 1)
    nuca = max((co[i] for i in LAZOS['cuello']), key=lambda c: c.y)
    return {
        'estatura': m['estatura'], 'cuello': m['cuello'], 'hombros': m['hombros'], 'busto': m['busto'],
        'bajo_busto': cinta(bm, co, 'bajo_busto'),
        'cintura': cintura,
        'cadera': m['cadera'],
        'muslo': cinta(bm, co, 'muslo'),
        'rodilla': cinta(bm, co, 'rodilla'),
        'biceps': cinta(bm, co, 'biceps'),
        'talle_trasero': recorrido(bm, (0, 0, 0), (1, 0, 0), nuca, detras),
        'largo_brazo': m['largo_brazo'],
        'tiro': recorrido(bm, (0, 0, 0), (1, 0, 0), delante, detras),
        'entrepierna': m['entrepierna'],
        'altura_cintura': _cm(z_cintura - z0),
    }


def trazos(bm):
    """Los puntos de cada cinta, para dibujarlas sobre el cuerpo en la hoja de contactos."""
    co = coordenadas(bm)
    _, z = cintura_natural(bm, co)
    t = {k: cinta(bm, co, k, con_casco=True)[1] for k in ('cuello', 'busto', 'bajo_busto', 'cintura_ombligo', 'cadera', 'muslo', 'rodilla', 'biceps')}
    t['cintura'] = cinta(bm, co, 'cintura_ombligo', z, con_casco=True)[1]
    return t
