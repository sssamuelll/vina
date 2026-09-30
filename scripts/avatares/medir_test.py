"""La cinta sobre figuras de valor conocido (spec § 9). Corre dentro de Blender:

    blender -b --factory-startup --python-exit-code 1 --python scripts/avatares/medir_test.py
"""
import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medir  # noqa: E402

PRUEBAS = []


def prueba(f):
    PRUEBAS.append(f)
    return f


def tubo(bm, r, alto, centro=(0, 0, 0), n=256, anillos=5, giro=Matrix.Identity(3)):
    """Tubo abierto de radio r a lo largo de z (girado por `giro`); devuelve los índices de cada anillo."""
    c = Vector(centro)
    filas = []
    for k in range(anillos):
        z = -alto / 2 + alto * k / (anillos - 1)
        filas.append([bm.verts.new(c + giro @ Vector((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z))) for i in range(n)])
    for a, b in zip(filas, filas[1:]):
        for i in range(n):
            bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bm.verts.index_update()
    return [[v.index for v in f] for f in filas]


def circulo(r, n=256):
    return 2 * n * r * math.sin(math.pi / n) * 100


@prueba
def cilindro_de_radio_10():
    bm = bmesh.new()
    tubo(bm, 0.10, 1.0)
    got = medir.anillo(bm, (0, 0, 0.1), (0, 0, 1), (0, 0, 0.1))
    assert abs(got - 62.83) < 0.05, got


@prueba
def caja_de_30_por_20():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Diagonal((0.3, 0.2, 1.0, 1.0)))
    got = medir.anillo(bm, (0, 0, 0), (0, 0, 1), (0, 0, 0))
    assert abs(got - 100.0) < 0.01, got


@prueba
def la_cinta_salta_las_concavidades():
    # prisma en L de 30 cm con brazo de 10: la envolvente mide 80 + 20·√2, no los 120 del contorno
    bm = bmesh.new()
    pts = [(0, 0), (0.3, 0), (0.3, 0.1), (0.1, 0.1), (0.1, 0.3), (0, 0.3)]
    abajo = [bm.verts.new((x, y, -0.5)) for x, y in pts]
    arriba = [bm.verts.new((x, y, 0.5)) for x, y in pts]
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((abajo[i], abajo[j], arriba[j], arriba[i]))
    got = medir.anillo(bm, (0, 0, 0), (0, 0, 1), (0.1, 0.1, 0))
    assert abs(got - (80 + 20 * math.sqrt(2))) < 0.01, got


@prueba
def el_brazo_pegado_no_entra_en_el_torso():
    bm = bmesh.new()
    tubo(bm, 0.15, 1.0)
    tubo(bm, 0.04, 1.0, centro=(0.20, 0, 0))
    torso = medir.anillo(bm, (0, 0, 0.1), (0, 0, 1), (0, 0, 0.1))
    brazo = medir.anillo(bm, (0, 0, 0.1), (0, 0, 1), (0.2, 0, 0.1))
    assert abs(torso - circulo(0.15)) < 0.05, torso
    assert abs(brazo - circulo(0.04)) < 0.05, brazo


@prueba
def en_un_miembro_inclinado_la_cinta_sigue_el_lazo():
    bm = bmesh.new()
    anillos = tubo(bm, 0.10, 1.0, giro=Matrix.Rotation(math.radians(30), 3, 'X'))
    co = [v.co.copy() for v in bm.verts]
    centro, normal = medir.plano_de_lazo(co, anillos[2])
    perpendicular = medir.anillo(bm, centro, normal, centro)
    horizontal = medir.anillo(bm, centro, (0, 0, 1), centro)
    assert abs(perpendicular - 62.83) < 0.05, perpendicular
    assert abs(horizontal - 67.78) < 0.1, horizontal  # elipse de semiejes 10 y 10/cos 30°


@prueba
def el_recorrido_va_por_el_camino_corto():
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=256, v_segments=128, radius=0.1)
    got = medir.recorrido(bm, (0, 0, 0), (1, 0, 0), (0, 0, 0.1), (0, 0.1, 0))
    assert abs(got - 15.71) < 0.05, got  # un cuarto de circunferencia, no tres


@prueba
def solo_mide_el_cuerpo_de_mpfb():
    bm = bmesh.new()
    tubo(bm, 0.1, 1.0)
    try:
        medir.coordenadas(bm)
    except ValueError as e:
        assert '13380' in str(e), e
    else:
        raise AssertionError('una malla que no es el cuerpo base debería rechazarse')


for f in PRUEBAS:
    f()
    print('ok', f.__name__)
print(f'medir_test: {len(PRUEBAS)} pruebas OK')
