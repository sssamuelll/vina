"""El acabado dentro de Blender con MPFB:

    blender -b --python-exit-code 1 --python scripts/avatares/acabado_test.py
"""
import os
import sys
import tempfile

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acabado  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

body, co, aristas, caras = acabado.cuerpo_base('mujer')

# 1) un .target escrito por acabado.py mueve cada vértice exactamente lo pedido: ejes XZY, -Y y escala
pedido = {8274: Vector((0.010, -0.020, 0.030)), 4121: Vector((0.0, 0.005, -0.004))}
ruta = os.path.join(tempfile.mkdtemp(), 'prueba.target')
assert acabado.escribir_target(ruta, 'prueba', pedido) == 2
TargetService.load_target(body, ruta, weight=1.0, name='prueba')
dg = bpy.context.evaluated_depsgraph_get()
dg.update()
movido = [v.co.copy() for v in body.evaluated_get(dg).to_mesh().vertices]
for i, d in pedido.items():
    assert (movido[i] - co[i] - d).length < 1.5e-4, (i, movido[i] - co[i], d)
assert (movido[100] - co[100]).length < 1e-6
print('ok el .target mueve lo pedido')

# 2) las regiones: dos pezones a los lados, la entrepierna en el medio, pesos entre 0 y 1
pesos = acabado.pesos_regiones(co, caras)
pez = pesos['pezones']
assert any(co[i].x > 0 for i in pez) and any(co[i].x < 0 for i in pez)
assert all(0 < w <= 1 for r in pesos.values() for w in r.values())
centro_ent = sum((co[i] for i in pesos['entrepierna']), Vector()) / len(pesos['entrepierna'])
assert abs(centro_ent.x) < 0.01, centro_ent
print('ok regiones')

# 3) el alisado solo mueve la región, y un peso 0 no mueve nada
d = acabado.alisar(co, aristas, {i: 1.0 for i in pez} | {next(iter(pez)): 0.0}, 60)
assert set(d) <= set(pez)
assert d[next(iter(pez))].length == 0
assert max(v.length for v in d.values()) > 1e-4
print('ok alisado')

print('acabado_test: 3 pruebas OK')
