"""Ajuste de un cuerpo MPFB a sus medidas objetivo (spec § 4.3 pasos 2 a 4)."""
import os

import bmesh
import bpy
import numpy as np

import medir
from bl_ext.blender_org.mpfb.entities.objectproperties import HumanObjectProperties
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService

TOLERANCIA = 0.5  # cm (spec § 3.4)
# Medida ajustada → targets de MPFB que la mueven, con el mismo peso.
CONTROLES = {
    'busto': ['torso/measure-bust-circ'],
    'cintura_ombligo': ['torso/measure-waist-circ'],
    'cadera': ['torso/measure-hips-circ'],
    'cuello': ['neck/measure-neck-circ'],
    'hombros': ['torso/measure-shoulder-dist'],
    'largo_brazo': ['arms/measure-upperarm-length', 'arms/measure-lowerarm-length'],
    'entrepierna': ['legs/measure-upperleg-height', 'legs/measure-lowerleg-height'],
}
LIMITE_CONTROL = 2.0  # los targets measure-* se extrapolan hasta ±2: a ±1 no llegan las tallas grandes
# Los macros también son variables del ajuste fino: weight es la palanca gruesa del volumen, y una pierna
# más larga sube la estatura 1:1, así que estatura y entrepierna se resuelven juntas.
MACROS = ('height', 'weight')


def evaluar(body):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    ev = body.evaluated_get(dg)
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    try:
        return medir.medidas_ajustables(bm)
    finally:
        bm.free()


def macro_real(nombre, u):
    """El macro height no aplica ningún target entre 0,49 y 0,51 (data/targets/macrodetails/macro.json):
    un Newton que cae ahí se queda sin gradiente (le pasó a hombre-eu48). La variable u salta esa zona;
    en 0,49 y en 0,51 el cuerpo es el mismo, así que la estatura sigue continua y creciente en u."""
    if nombre != 'height':
        return u
    return 0.98 * u if u <= 0.5 else 0.51 + 0.98 * (u - 0.5)


def fijar_macro(body, nombre, u):
    HumanObjectProperties.set_value(nombre, macro_real(nombre, u), entity_reference=body)
    TargetService.reapply_macro_details(body)


def biseccion(body, macro, f, objetivo, pasos=16):
    """Valor (u) del macro con f(medidas) == objetivo; f crece con el macro. Se queda en el borde si no llega."""
    lo, hi = 0.0, 1.0
    for _ in range(pasos):
        mitad = (lo + hi) / 2
        fijar_macro(body, macro, mitad)
        if f(evaluar(body)) < objetivo:
            lo = mitad
        else:
            hi = mitad
    fijar_macro(body, macro, (lo + hi) / 2)
    return (lo + hi) / 2


def cargar_controles(body, claves):
    tdir = LocationService.get_mpfb_data('targets')
    for k in claves:
        for t in CONTROLES[k]:
            for s in ('incr', 'decr'):
                clave = TargetService.load_target(body, os.path.join(tdir, f'{t}-{s}.target.gz'), weight=0.0, name=f'{t}-{s}')
                clave.slider_max = LIMITE_CONTROL


def fijar(body, x):
    """x: {variable: valor}; variable = macro de MPFB (u, 0..1) o medida con controles (±LIMITE_CONTROL)."""
    if any(HumanObjectProperties.get_value(k, entity_reference=body) != macro_real(k, v) for k, v in x.items() if k in MACROS):
        for k, v in x.items():
            if k in MACROS:
                HumanObjectProperties.set_value(k, macro_real(k, v), entity_reference=body)
        TargetService.reapply_macro_details(body)
    for k, w in x.items():
        if k not in MACROS:
            for t in CONTROLES[k]:
                body.data.shape_keys.key_blocks[f'{t}-incr'].value = max(w, 0.0)
                body.data.shape_keys.key_blocks[f'{t}-decr'].value = max(-w, 0.0)


def rango(k):
    return (0.0, 1.0) if k in MACROS else (-LIMITE_CONTROL, LIMITE_CONTROL)


def newton(body, objetivo, x, iteraciones=12, paso=0.05):
    """Mínimos cuadrados sobre todas las variables a la vez. La que choca con su tope se congela ahí
    y el resto absorbe lo que falta. Devuelve (medidas, error por medida)."""
    ecuaciones, libres = list(objetivo), list(x)
    for _ in range(iteraciones):
        fijar(body, x)
        m = evaluar(body)
        err = np.array([objetivo[k] - m[k] for k in ecuaciones])
        if np.abs(err).max() < TOLERANCIA / 2 or not libres:
            break
        J = np.zeros((len(ecuaciones), len(libres)))
        for i, k in enumerate(libres):
            h = paso if x[k] + paso <= rango(k)[1] else -paso
            fijar(body, {**x, k: x[k] + h})
            m2 = evaluar(body)
            J[:, i] = [(m2[j] - m[j]) / h for j in ecuaciones]
        dx = np.linalg.lstsq(J, err, rcond=None)[0]
        for k, d in zip(list(libres), dx):
            lo, hi = rango(k)
            x[k] = float(np.clip(x[k] + d, lo, hi))
            if x[k] in (lo, hi):
                libres.remove(k)
    fijar(body, x)
    m = evaluar(body)
    return m, {k: round(m[k] - objetivo[k], 2) for k in ecuaciones}


def ajustar(body, objetivo, bitacora=print):
    """Lleva el cuerpo a `objetivo` (cm): macros height y weight por bisección (grueso) y luego todo por
    mínimos cuadrados (fino). Devuelve (medidas, variables). Falla si alguna queda a > 0,5 cm."""
    claves = [k for k in CONTROLES if k in objetivo]
    cargar_controles(body, claves)
    x = {'height': biseccion(body, 'height', lambda m: m['estatura'], objetivo['estatura']),
         'weight': biseccion(body, 'weight', lambda m: m['cintura_ombligo'], objetivo['cintura_ombligo'])}
    x |= {k: 0.0 for k in claves}
    m, err = newton(body, objetivo, x)
    bitacora(f'error {err} variables { {k: round(v, 3) for k, v in x.items()} }')
    peor = max(err, key=lambda k: abs(err[k]))
    if abs(err[peor]) > TOLERANCIA:
        raise RuntimeError(f'no converge: {peor} queda a {err[peor]} cm del objetivo {objetivo[peor]}; errores {err}')
    return m, x
