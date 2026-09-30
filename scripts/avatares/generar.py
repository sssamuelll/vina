"""Una avatar de la biblioteca por llamada (spec § 4.3). Blender sin interfaz:

    blender -b --python-exit-code 1 --python scripts/avatares/generar.py -- --talla mujer-eu38 --salida .tmp/avatares

Escribe en --salida: <id>.glb (sin comprimir: generar-todas.mjs lo pasa por meshopt), <id>.webp
(miniatura, frente y perfil), <id>-hoja.png (con las cintas dibujadas, para la hoja de contactos) y
<id>.json ({entrada: la del catálogo, informe: el ajuste}). Sin --python-exit-code 1, un error de
Python dentro de Blender sale con código 0.
"""
import argparse
import glob
import json
import math
import os
import sys
import tomllib

import bmesh
import bpy
from mathutils import Matrix, Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import ajuste  # noqa: E402
import medir  # noqa: E402
from bl_ext.blender_org import mpfb  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

GENERADOR = '1.0.0'  # súbelo cuando cambie algo que se ve en la malla o en las medidas
MPFB = '2.0.17'
BLENDER = (5, 0)
GRIS = 0.72  # sRGB. Va en textura: la app pone el color del material en blanco (AvatarModel.tsx:662)
HUESOS = {
    'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
    'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandThumb1', 'LeftHandThumb2', 'LeftHandThumb3',
    'LeftHandIndex1', 'LeftHandIndex2', 'LeftHandIndex3', 'LeftHandMiddle1', 'LeftHandMiddle2', 'LeftHandMiddle3',
    'LeftHandRing1', 'LeftHandRing2', 'LeftHandRing3', 'LeftHandPinky1', 'LeftHandPinky2', 'LeftHandPinky3',
    'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
    'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3', 'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
    'RightHandRing1', 'RightHandRing2', 'RightHandRing3', 'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
}  # los 52 del avatar de hoy (public/default-avatar.glb), sin el prefijo mixamorig:
SEXO = {'mujer': 0.0, 'hombre': 1.0, 'nina': 0.0, 'nino': 1.0}


def verificar_versiones():
    with open(os.path.join(os.path.dirname(mpfb.__file__), 'blender_manifest.toml'), 'rb') as f:
        v = tomllib.load(f)['version']
    if v != MPFB:
        raise SystemExit(f'MPFB {v} instalado; el generador está fijado a {MPFB}')
    if tuple(bpy.app.version[:2]) != BLENDER:
        raise SystemExit(f'Blender {bpy.app.version_string}; el generador está fijado a {BLENDER[0]}.{BLENDER[1]}')


def coordenadas_evaluadas(body):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    co = [body.matrix_world @ v.co for v in ev.to_mesh().vertices]
    ev.to_mesh_clear()
    return co


def hornear(body):
    """Rig mixamo, shape keys a la malla, fuera los ayudantes, pies al suelo. Devuelve el rig."""
    antes = coordenadas_evaluadas(body)
    rig = HumanService.add_builtin_rig(body, 'mixamo')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(body.modifiers):
        if m.type == 'MASK':
            bpy.ops.object.modifier_apply(modifier=m.name)
    suelo = min((body.matrix_world @ v.co).z for v in body.data.vertices)
    rig.location.z -= suelo
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    despues = [body.matrix_world @ v.co for v in body.data.vertices]
    if len(despues) != medir.N_CUERPO:
        raise RuntimeError(f'tras hornear quedan {len(despues)} vértices; se esperaban {medir.N_CUERPO}')
    desvio = max((d - (a - Vector((0, 0, suelo)))).length for a, d in zip(antes, despues))
    if desvio > 1e-4:
        raise RuntimeError(f'hornear movió la malla {desvio * 1000:.2f} mm: los índices de medir.py ya no valen')
    for b in rig.data.bones:
        b.name = b.name.replace('mixamorig:', '')
    faltan = HUESOS - {b.name for b in rig.data.bones}
    if faltan:
        raise RuntimeError(f'faltan huesos: {sorted(faltan)}')
    body.name, rig.name = 'vina_body', 'Armature'
    return rig


def material(body):
    mat = bpy.data.materials.new('vina_body_material')
    mat.use_nodes = True
    lineal = ((GRIS + 0.055) / 1.055) ** 2.4
    mat.diffuse_color = (lineal, lineal, lineal, 1)  # lo que pinta el render de la miniatura
    img = bpy.data.images.new('vina_body_gris', 4, 4)
    img.pixels = [GRIS, GRIS, GRIS, 1.0] * 16
    img.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.7
    mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    body.data.materials.clear()
    body.data.materials.append(mat)


def bm_final(body):
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.transform(body.matrix_world)
    return bm


def linea(nombre, puntos, mat):
    cu = bpy.data.curves.new(nombre, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.0015
    sp = cu.splines.new('POLY')
    sp.points.add(len(puntos) - 1)
    for i, p in enumerate(puntos):
        sp.points[i].co = (p.x, p.y, p.z, 1)
    sp.use_cyclic_u = True
    ob = bpy.data.objects.new(nombre, cu)
    ob.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def fotografiar(body, alto, ruta_webp, ruta_hoja, trazos):
    """Frente y perfil en una imagen: la miniatura limpia y la de la hoja con las cintas."""
    scn = bpy.context.scene
    scn.render.engine = 'BLENDER_WORKBENCH'
    scn.display.shading.light = 'STUDIO'
    scn.display.shading.color_type = 'MATERIAL'
    scn.view_settings.view_transform = 'Standard'
    mundo = bpy.data.worlds.new('fondo')
    mundo.color = (1, 1, 1)
    scn.world = mundo
    dg = bpy.context.evaluated_depsgraph_get()
    perfil = bpy.data.objects.new('perfil', bpy.data.meshes.new_from_object(body.evaluated_get(dg)))
    scn.collection.objects.link(perfil)
    xs = [v.co.x for v in body.data.vertices]
    ys = [v.co.y for v in body.data.vertices]
    # el perfil, girado 90°, mira a la derecha: su x va de desde − max(y) a desde − min(y)
    desde = max(xs) + alto * 0.1 + max(ys)
    giro = Matrix.Translation((desde, 0, 0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z')
    perfil.matrix_world = giro
    izq, der = min(xs), desde - min(ys)
    cam = bpy.data.objects.new('camara', bpy.data.cameras.new('camara'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(der - izq, alto) * 1.06
    cam.location = ((izq + der) / 2, -10, alto / 2)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scn.render.resolution_x = scn.render.resolution_y = 512
    scn.render.image_settings.file_format = 'WEBP'
    scn.render.image_settings.quality = 80
    scn.render.filepath = ruta_webp
    bpy.ops.render.render(write_still=True)
    rojo = bpy.data.materials.new('cinta')
    rojo.diffuse_color = (0.8, 0.05, 0.05, 1)
    for k, pts in trazos.items():
        linea(f'cinta-{k}', pts, rojo)
        linea(f'cinta-{k}-perfil', [giro @ p for p in pts], rojo)
    scn.render.resolution_x = scn.render.resolution_y = 900
    scn.render.image_settings.file_format = 'PNG'
    scn.render.filepath = ruta_hoja
    bpy.ops.render.render(write_still=True)


def entrada_de_catalogo(talla, m):
    medidas = {k: round(v, 1) for k, v in m.items()}
    lleva_bajo_busto = talla['grupo'] == 'mujer' or (talla['grupo'] == 'nina' and talla['talla']['edad'] >= 10)
    if not lleva_bajo_busto:
        del medidas['bajo_busto']
    return {'id': talla['id'], 'grupo': talla['grupo'], 'talla': talla['talla'],
            'archivo': f"{talla['id']}.glb", 'miniatura': f"{talla['id']}.webp",
            'medidas': medidas, 'fuente': talla['fuente'], 'generador': GENERADOR}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--talla', required=True)
    p.add_argument('--salida', required=True)
    p.add_argument('--tallas', default=os.path.join(AQUI, 'tallas.json'))
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    verificar_versiones()
    with open(a.tallas, encoding='utf-8') as f:
        talla = next((t for t in json.load(f)['tallas'] if t['id'] == a.talla), None)
    if talla is None:
        raise SystemExit(f'{a.talla} no está en {a.tallas}')
    os.makedirs(a.salida, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro['gender'] = SEXO[talla['grupo']]
    edad = talla['talla'].get('edad')
    macro['age'] = 0.5 if edad is None else (edad - 1) / 48  # años → macro: MakeHuman 1.1, apps/human.py setAgeYears
    body = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)
    acabados = sorted(glob.glob(os.path.join(AQUI, 'acabado', talla['grupo'], '*.target')))
    for t in acabados:
        TargetService.load_target(body, t, weight=1.0, name='acabado-' + os.path.basename(t)[:-len('.target')])
    objetivo = {k: float(v) for k, v in talla['objetivo'].items()}
    ajustadas, variables = ajuste.ajustar(body, objetivo, bitacora=lambda s: print(f'[{a.talla}] {s}'))

    hornear(body)
    material(body)
    bm = bm_final(body)
    m = medir.medidas(bm)
    trazos = medir.trazos(bm)
    bm.free()
    base = os.path.join(os.path.abspath(a.salida), a.talla)  # Blender resuelve las rutas relativas del render contra la raíz de la unidad
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=base + '.glb', export_format='GLB', export_skins=True,
                              export_morph=False, export_animations=False)
    fotografiar(body, m['estatura'] / 100, base + '.webp', base + '-hoja.png', trazos)
    informe = {'objetivo': objetivo, 'ajustadas': {k: round(ajustadas[k], 2) for k in objetivo},
               'error': {k: round(ajustadas[k] - objetivo[k], 2) for k in objetivo},
               'variables': {k: round(v, 4) for k, v in variables.items()},
               'acabado': [os.path.basename(t) for t in acabados], 'n': talla['n']}
    with open(base + '.json', 'w', encoding='utf-8') as f:
        json.dump({'entrada': entrada_de_catalogo(talla, m), 'informe': informe}, f, ensure_ascii=False, indent=1)
    print(f'[{a.talla}] listo: {json.dumps(informe["error"])}')


main()
