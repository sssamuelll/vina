"""El ajuste, y dónde mide medir.py, sobre cuerpos reales de MPFB:

    blender -b --python-exit-code 1 --python scripts/avatares/ajuste_test.py
"""
import json
import os
import sys

import bmesh
import bpy
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ajuste  # noqa: E402
import medir  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

# la variable u del macro height salta su zona muerta (0,49; 0,51), continua y creciente. Es la guarda
# de la regresión de hombre-eu48: el caso de convergencia de abajo no la reproduce sin el acabado cargado.
h = [ajuste.macro_real('height', k / 1000) for k in range(1001)]
assert all(a < b for a, b in zip(h, h[1:])), 'u debe ser estrictamente creciente'
assert not any(0.49 < v < 0.51 for v in h), 'u no puede caer en la zona muerta'
assert abs(h[0]) < 1e-12 and abs(h[500] - 0.49) < 1e-12 and abs(h[-1] - 1.0) < 1e-12
assert ajuste.macro_real('weight', 0.5) == 0.5
print('ok zona muerta de height')

tallas = {t['id']: t for t in json.load(open(os.path.join(AQUI, 'tallas.json'), encoding='utf-8'))['tallas']}


def cuerpo(gender, age):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update({'gender': gender, 'age': age})
    return HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)


def donde_mide(id_, body):
    """Cada cinta donde la pone ISO 8559-1 (hallazgos de la revisión final del 2026-09-30)."""
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    co = medir.coordenadas(bm)
    z0 = min(c.z for c in co)
    m = medir.medidas(bm)
    sagital = medir.cortar(bm, (0, 0, 0), (1, 0, 0))
    horcajadura = min((p for a in sagital for p in a), key=lambda p: p.z).z
    # muslo: justo bajo el pliegue glúteo, en la pierna izquierda sola; el lazo de MakeHuman cae 7 cm más abajo
    muslo = medir.trazos(bm)['muslo']
    bajo = sum(p.z for p in muslo) / len(muslo) - horcajadura
    assert -0.03 < bajo < -0.005 and min(p.x for p in muslo) > 0, (id_, 'muslo', bajo)
    # cintura: entre la cresta ilíaca (el lazo del ombligo) y la costilla más baja (0,37 del tramo hasta el
    # bajo busto, calibrado con tenthribheight de ANSUR); el mínimo de la malla de mujer cae por encima
    zo = medir.plano_de_lazo(co, medir.LAZOS['cintura_ombligo'])[0].z
    zb = medir.plano_de_lazo(co, medir.LAZOS['bajo_busto'])[0].z
    zc = z0 + m['altura_cintura'] / 100
    assert zo - 1e-6 <= zc <= zo + 0.37 * (zb - zo), (id_, 'cintura', zc - zo, zb - zo)
    # talle trasero: desde la cervical (la base del cuello, donde el rig pone el hueso Neck), no desde la
    # nuca del lazo del cuello, que queda a media altura del cuello
    cervical = sum((co[i] for i in medir.CERVICAL), Vector()) / len(medir.CERVICAL)
    esperado = medir.recorrido(bm, (0, 0, 0), (1, 0, 0), cervical, medir.punto_sagital(sagital, zc, 1))
    assert abs(m['talle_trasero'] - esperado) < 0.05, (id_, 'talle', m['talle_trasero'], esperado)
    bm.free()
    rig = HumanService.add_builtin_rig(body, 'mixamo')
    cuello = (rig.matrix_world @ rig.data.bones['mixamorig:Neck'].head_local).z
    assert abs(cervical.z - cuello) < 0.025, (id_, 'cervical', cervical.z - cuello)


# hombre-eu48: su estatura cae junto a la neutra, en la zona muerta del macro height
for id_, gender, age in (('mujer-eu48', 0.0, 0.5), ('nina-8', 0.0, 7 / 48), ('hombre-eu48', 1.0, 0.5)):
    objetivo = {k: float(v) for k, v in tallas[id_]['objetivo'].items()}
    body = cuerpo(gender, age)
    m, _ = ajuste.ajustar(body, objetivo, bitacora=lambda s: None)
    assert all(abs(m[k] - objetivo[k]) <= ajuste.TOLERANCIA for k in objetivo), (id_, m)
    print('ok converge', id_)
    donde_mide(id_, body)
    print('ok donde mide', id_)

try:
    ajuste.ajustar(cuerpo(0.0, 0.5), {'estatura': 300.0, 'cintura_ombligo': 79.1}, bitacora=lambda s: None)
except RuntimeError as e:
    assert 'estatura' in str(e) and '300' in str(e), e
else:
    raise AssertionError('una estatura de 300 cm no se alcanza: debía fallar')
print('ajuste_test: 8 pruebas OK')
