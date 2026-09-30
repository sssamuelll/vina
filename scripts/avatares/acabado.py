"""Acabado de maniquí (spec § 4.2): desplazamientos guardados como .target de MPFB en acabado/<grupo>/.
generar.py los carga a peso 1 antes de ajustar, así que valen para todas las tallas del grupo.

    # manera 1, por script: pezones y entrepierna
    blender -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo mujer
    # manera 2, a mano: la cabeza lisa
    blender -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo mujer --preparar
    #   (esculpir .tmp/avatares/escultura-mujer.blend en Blender y guardar)
    blender -b --python-exit-code 1 --python scripts/avatares/acabado.py -- --grupo mujer --guardar-cabeza

La cabeza no va por script: alisarla con Taubin deja la cara casi igual, el laplaciano la encoge
hacia el cuello y el alisado radial la vuelve una bola con rasgos fantasma (los tres medidos el
2026-09-30). MPFB no trae grupos de vértices para estas regiones: se ubican con los lazos de medir.py.
"""
import argparse
import os
import sys

import bmesh
import bpy
from mathutils import Vector

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import medir  # noqa: E402
from bl_ext.blender_org.mpfb.services.humanservice import HumanService  # noqa: E402
from bl_ext.blender_org.mpfb.services.targetservice import TargetService  # noqa: E402

ESCALA_TARGET = 10.0  # m → unidades de MakeHuman (dm): lo que hace get_shape_key_as_dict con scale_factor 0,1
BASES = {  # cuerpo base de cada grupo: el acabado se calcula sobre él
    'mujer': {'gender': 0.0, 'age': 0.5},
    'hombre': {'gender': 1.0, 'age': 0.5},
    'nina': {'gender': 0.0, 'age': (8 - 1) / 48},
    'nino': {'gender': 1.0, 'age': (8 - 1) / 48},
}
# Perillas de calibración: se ajustan mirando la hoja de contactos.
REGIONES = {  # región: (radio en m para un cuerpo de 1,70 m, iteraciones de alisado)
    'pezones': (0.035, 60),
    'entrepierna': (0.06, 60),
}


def suave(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def cuerpo_base(grupo):
    """El cuerpo base del grupo: (objeto, coordenadas, aristas, caras) del cuerpo sin ayudantes."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TargetService.get_default_macro_info_dict()
    macro.update(BASES[grupo])
    body = HumanService.create_human(macro_detail_dict=macro, feet_on_ground=True)
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    co = [v.co.copy() for v in me.vertices]
    aristas = [tuple(e.vertices) for e in me.edges]
    caras = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    if len(co) != medir.N_CUERPO:
        raise RuntimeError(f'el cuerpo base tiene {len(co)} vértices; se esperaban {medir.N_CUERPO}')
    return body, co, aristas, caras


def malla(co, caras):
    bm = bmesh.new()
    vs = [bm.verts.new(c) for c in co]
    for f in caras:
        bm.faces.new([vs[i] for i in f])
    bm.verts.index_update()
    return bm


def pesos_regiones(co, caras):
    """{región: {índice: peso 0..1}}: esferas alrededor de cada ápice del busto y de la horcajadura."""
    escala = (max(c.z for c in co) - min(c.z for c in co)) / 1.70
    z_busto = medir.plano_de_lazo(co, medir.LAZOS['busto'])[0].z
    r = REGIONES['pezones'][0] * escala
    centros = {'pezones': [], 'entrepierna': []}
    for lado in (1, -1):
        cerca = [c for c in co if abs(c.z - z_busto) < 2 * r and lado * c.x > r]
        centros['pezones'].append(min(cerca, key=lambda c: c.y))  # el más adelantado: -y es adelante
    bm = malla(co, caras)
    centros['entrepierna'].append(min((p for a in medir.cortar(bm, (0, 0, 0), (1, 0, 0)) for p in a), key=lambda p: p.z))
    bm.free()
    pesos = {}
    for region, puntos in centros.items():
        radio = REGIONES[region][0] * escala
        pesos[region] = {}
        for i, c in enumerate(co):
            d = min((c - p).length for p in puntos)
            if d < radio:
                pesos[region][i] = 1 - suave(d / radio)
    return pesos


def alisar(co, aristas, pesos, iteraciones, lam=0.5):
    """Desplazamientos {índice: Vector} del alisado laplaciano de la región, multiplicados por el peso.
    bmesh.ops.smooth_laplacian_vert no mueve nada en Blender 5.0 (probado): por eso va a mano."""
    vecinos = {i: [] for i in pesos}
    for a, b in aristas:
        if a in vecinos:
            vecinos[a].append(b)
        if b in vecinos:
            vecinos[b].append(a)
    pos = list(co)
    for _ in range(iteraciones):
        nuevo = {i: pos[i] + lam * (sum((pos[j] for j in vs), Vector()) / len(vs) - pos[i]) for i, vs in vecinos.items()}
        for i, v in nuevo.items():
            pos[i] = v
    return {i: (pos[i] - co[i]) * w for i, w in pesos.items()}


def escribir_target(ruta, nombre, desplazamientos, umbral=1e-5):
    """Desplazamientos en metros (ejes de Blender) → .target de MPFB. Devuelve cuántos vértices lleva."""
    info = {'name': nombre, 'vertices': [(i, *(d * ESCALA_TARGET)) for i, d in sorted(desplazamientos.items()) if d.length > umbral]}
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    with open(ruta, 'w', encoding='utf-8') as f:
        f.write(TargetService.shape_key_info_as_target_string(info))
    return len(info['vertices'])


def diferencia(base, esculpido):
    if len(esculpido) != len(base):
        raise ValueError(f'la escultura tiene {len(esculpido)} vértices y la base {len(base)}: no uses Dyntopo, Remesh ni borres geometría')
    return {i: e - b for i, (b, e) in enumerate(zip(base, esculpido))}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--grupo', required=True, choices=sorted(BASES))
    p.add_argument('--preparar', action='store_true')
    p.add_argument('--guardar-cabeza', action='store_true')
    a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
    blend = os.path.abspath(os.path.join('.tmp', 'avatares', f'escultura-{a.grupo}.blend'))
    salida = os.path.join(AQUI, 'acabado', a.grupo)
    body, co, aristas, caras = cuerpo_base(a.grupo)
    if a.preparar:
        me = bpy.data.meshes.new('escultura')
        me.from_pydata([tuple(c) for c in co], [], caras)
        ob = bpy.data.objects.new('escultura', me)
        bpy.data.objects.remove(body)
        bpy.context.scene.collection.objects.link(ob)
        os.makedirs(os.path.dirname(blend), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=blend)
        print(f'acabado: esculpe la cabeza en {blend} (modo Sculpt, simetría X, sin Dyntopo) y guarda')
    elif a.guardar_cabeza:
        with bpy.data.libraries.load(blend) as (desde, hacia):
            hacia.objects = ['escultura']
        d = diferencia(co, [v.co.copy() for v in hacia.objects[0].data.vertices])
        centro, normal = medir.plano_de_lazo(co, medir.LAZOS['cuello'])
        arriba = normal if normal.z > 0 else -normal
        abajo = sum(1 for i, v in d.items() if v.length > 1e-4 and (co[i] - centro).dot(arriba) < 0)
        n = escribir_target(os.path.join(salida, 'cabeza.target'), 'cabeza', d)
        print(f'acabado {a.grupo}/cabeza.target: {n} vértices' + (f'; ojo: {abajo} están bajo el cuello' if abajo else ''))
    else:
        for region, pesos in pesos_regiones(co, caras).items():
            n = escribir_target(os.path.join(salida, f'{region}.target'), region, alisar(co, aristas, pesos, REGIONES[region][1]))
            print(f'acabado {a.grupo}/{region}.target: {n} vértices')


if __name__ == '__main__':
    main()
