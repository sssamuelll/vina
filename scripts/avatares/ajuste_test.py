"""El ajuste sobre un cuerpo real de MPFB:

    blender -b --python-exit-code 1 --python scripts/avatares/ajuste_test.py
"""
import json
import os
import sys

import bpy

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ajuste  # noqa: E402
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


# hombre-eu48: su estatura cae junto a la neutra, en la zona muerta del macro height
for id_, gender, age in (('mujer-eu48', 0.0, 0.5), ('nina-8', 0.0, 7 / 48), ('hombre-eu48', 1.0, 0.5)):
    objetivo = {k: float(v) for k, v in tallas[id_]['objetivo'].items()}
    m, _ = ajuste.ajustar(cuerpo(gender, age), objetivo, bitacora=lambda s: None)
    assert all(abs(m[k] - objetivo[k]) <= ajuste.TOLERANCIA for k in objetivo), (id_, m)
    print('ok converge', id_)

try:
    ajuste.ajustar(cuerpo(0.0, 0.5), {'estatura': 300.0, 'cintura_ombligo': 79.1}, bitacora=lambda s: None)
except RuntimeError as e:
    assert 'estatura' in str(e) and '300' in str(e), e
else:
    raise AssertionError('una estatura de 300 cm no se alcanza: debía fallar')
print('ajuste_test: 5 pruebas OK')
