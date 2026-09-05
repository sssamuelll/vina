import { describe, it, expect } from 'vitest';
import { DOCK_2D_CATALOG, getDockToolById } from '../dock2dTools';
import { DEFAULT_DOCK_2D_IDS } from '../../../store/dockSlice';

describe('dock2dTools catalog', () => {
  // 19 desde el 2026-09-05: entraron las cinco del censo de puertas —hand,
  // measureCurve, compareCurves, slashAndSpread, trimPlace—, que tenían el
  // gesto entero y ninguna forma de llegar salvo que el copiloto las activara.
  // Van al final y sin atajo; el default sigue en doce.
  it('has 19 entries (3 unwired phantom tools removed #529; point y seamEdit añadidos; line retirado en internalShape; circle nace en #1111; las cinco sin puerta se abren)', () => {
    expect(DOCK_2D_CATALOG).toHaveLength(19);
  });

  it('las cinco que estrenaron puerta van al final, después de hilo', () => {
    // El orden importa: el catálogo abre con el default en orden y cierra con
    // lo que está fuera de fábrica. Si una se cuela antes de `grainline`, el
    // aserto de "los primeros 12 son el default" seguiría verde y el
    // personalizador mostraría el grupo partido.
    expect(DOCK_2D_CATALOG.slice(-5).map((t) => t.id)).toEqual([
      'hand', 'measureCurve', 'compareCurves', 'slashAndSpread', 'trimPlace',
    ]);
  });

  it('drops the unwired phantom tools and the retired line tool', () => {
    // grading / textAnnotation / addPiece had no canvas mousedown handler → silent
    // no-op; their real behavior lives in the Grading panel, Properties panel, and
    // pen/rectangle respectively. line died in the internal-line unification
    // (spec 2026-08-29): internalShape inherits its dock slot as "Línea interna".
    expect(getDockToolById('grading')).toBeUndefined();
    expect(getDockToolById('textAnnotation')).toBeUndefined();
    expect(getDockToolById('addPiece')).toBeUndefined();
    expect(getDockToolById('line')).toBeUndefined();
    expect(getDockToolById('internalShape')?.label).toBe('Línea interna');
  });

  it('línea interna ocupa la ranura de línea, con G', () => {
    const ids = DOCK_2D_CATALOG.map((t) => t.id);
    expect(ids.indexOf('internalShape')).toBe(ids.indexOf('pen') + 1);
    expect(getDockToolById('internalShape')?.shortcut).toBe('G');
  });

  it('surfaces the seamAllowance tool (reachability — María, hallazgo #2)', () => {
    const sa = getDockToolById('seamAllowance');
    expect(sa).toBeTruthy();
    expect(sa!.label).toBe('Margen de costura');
    expect(sa!.shortcut).toBe('O');
  });

  it('surfaces the point tool between editar y pluma, sin atajo a propósito (maria-203)', () => {
    const point = getDockToolById('point');
    expect(point).toBeTruthy();
    expect(point!.label).toBe('Punto');
    // Sin shortcut: el catálogo documenta atajos reales de CLO3D y CLO no le
    // da atajo a su Add Point — inventarle uno enseñaría un hábito falso.
    expect(point!.shortcut).toBeUndefined();
    const ids = DOCK_2D_CATALOG.map((t) => t.id);
    expect(ids.indexOf('point')).toBe(ids.indexOf('editPattern') + 1);
    expect(ids.indexOf('pen')).toBe(ids.indexOf('point') + 1);
  });

  it('getDockToolById resolves a member and is undefined for an unknown id', () => {
    expect(getDockToolById('select')?.label).toBe('Seleccionar');
    expect(getDockToolById('nope')).toBeUndefined();
  });

  it('every default id resolves in the catalog (drift guard)', () => {
    for (const id of DEFAULT_DOCK_2D_IDS) {
      expect(getDockToolById(id), `default id "${id}" missing from catalog`).toBeTruthy();
    }
  });

  it('catalog ids are all distinct', () => {
    const ids = DOCK_2D_CATALOG.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // 12 desde la auditoría de UI del 2026-08-14: seamAllowance y notch entraron
  // al default porque no tenían puerta (ley de puertas, § 5.6 del informe).
  it('the first 12 catalog ids are the defaults in order', () => {
    expect(DOCK_2D_CATALOG.slice(0, DEFAULT_DOCK_2D_IDS.length).map((tool) => tool.id))
      .toEqual(DEFAULT_DOCK_2D_IDS);
  });

  it('el catálogo tiene las dos mitades del menú coser', () => {
    const ids = DOCK_2D_CATALOG.map(t => t.id);
    expect(ids).toContain('seam');
    expect(ids).toContain('seamEdit');
  });

  it('coser lleva N y editar costuras lleva B, como CLO3D', () => {
    expect(getDockToolById('seam')?.shortcut).toBe('N');
    expect(getDockToolById('seamEdit')?.shortcut).toBe('B');
  });
});
