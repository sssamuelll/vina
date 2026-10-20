"""La cabeza de maniquí sobre cuerpos reales de MPFB ya horneados:

    blender -b --python-exit-code 1 --python scripts/avatares/cabeza_test.py
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import kdtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cabeza  # noqa: E402
import medir  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402


def horneado(gender, age):
    """Como generar.py: rig mixamo, shape keys a la malla, sin ayudantes."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update({'gender': gender, 'age': age})
    body = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)
    HumanService.add_builtin_rig(body, 'mixamo')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(body.modifiers):
        if m.type == 'MASK':
            bpy.ops.object.modifier_apply(modifier=m.name)
    return body


for nombre, gender, age in (('mujer', 0.0, 0.5), ('niño de 2', 1.0, 1 / 48)):
    body = horneado(gender, age)
    antes = [v.co.copy() for v in body.data.vertices]
    cc, n = medir.plano_de_lazo(antes, medir.LAZOS['cuello'])
    if n.z < 0:
        n = -n
    alto_antes = max(c.z for c in antes) - min(c.z for c in antes)
    corte = cabeza.CORTE * alto_antes

    cabeza.cabeza_de_maniqui(body)

    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.normal_update()
    # cerrada: sin bordes abiertos ni aristas sueltas
    assert not [e for e in bm.edges if len(e.link_faces) != 2], (nombre, 'la malla quedó abierta')
    # lisa: arriba del corte, ninguna arista dobla más de 50°. Medido el 2026-09-30: la cabeza original
    # dobla 128° (párpados, labios, orejas); la de maniquí, 37° en la esquina mandíbula-cuello, que se queda
    tapa = [f for f in bm.faces if (f.calc_center_median() - cc).dot(n) > corte]
    en_tapa = set(tapa)
    doblez = max(math.degrees(e.link_faces[0].normal.angle(e.link_faces[1].normal, 0))
                 for f in tapa for e in f.edges if e.link_faces[0] in en_tapa and e.link_faces[1] in en_tapa)
    assert doblez < 50, (nombre, 'la cabeza tiene rasgos', doblez)
    # el cuello, intacto: todo lo que estaba bajo el corte sigue en su lugar
    kd = kdtree.KDTree(len(bm.verts))
    for v in bm.verts:
        kd.insert(v.co, v.index)
    kd.balance()
    for c in antes:
        if (c - cc).dot(n) < 0:
            assert kd.find(c)[2] < 1e-6, (nombre, 'se movió el cuello', tuple(c))
    # la tapa se mueve con el rig: cada vértice nuevo pesado a algún hueso, la coronilla sobre todo a Head
    dl = bm.verts.layers.deform.active
    grupos = {g.index: g.name for g in body.vertex_groups}
    huesos = {g for g, nom in grupos.items() if nom in body.parent.data.bones}  # MPFB trae otros grupos que no son huesos
    for v in bm.verts:
        if (v.co - cc).dot(n) > corte:
            # MPFB no normaliza los pesos (el exportador glTF sí): lo que importa es que ninguno quede sin hueso
            assert sum(p for g, p in v[dl].items() if g in huesos) > 0.1, (nombre, 'vértice sin hueso', dict(v[dl]))
    coronilla = max(bm.verts, key=lambda v: v.co.z)
    assert 'Head' in grupos[max(((g, p) for g, p in coronilla[dl].items() if g in huesos), key=lambda kv: kv[1])[0]], (nombre, 'coronilla sin Head')
    # la estatura no cambia: es una medida ajustada (≤ 0,5 cm, spec § 3.4) y la mediana y el suavizado
    # bajan la coronilla (medido: 5 a 8 mm en las tallas ajustadas)
    alto = max(v.co.z for v in bm.verts) - min(v.co.z for v in bm.verts)
    assert abs(alto - alto_antes) < 0.001, (nombre, 'estatura', alto - alto_antes)
    bm.free()
    print('ok cabeza de maniquí', nombre)

print('cabeza_test: 2 pruebas OK')
