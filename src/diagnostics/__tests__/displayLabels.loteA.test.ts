import { describe, expect, it } from 'vitest';
import { inspectionEdgeTypeLabel, inspectionInternalTypeLabel } from '../displayLabels';

describe('etiquetas visibles del Inspector', () => {
  it('traduce tipos de borde sin alterar el enum', () => {
    expect(inspectionEdgeTypeLabel('seam')).toBe('costura');
    expect(inspectionEdgeTypeLabel('dart-leg')).toBe('lado de pinza');
    expect(inspectionEdgeTypeLabel('future-edge')).toBe('tipo desconocido');
  });

  it('traduce tipos de línea interna sin alterar el enum', () => {
    expect(inspectionInternalTypeLabel('grainline')).toBe('hilo');
    expect(inspectionInternalTypeLabel('notch')).toBe('piquete');
    expect(inspectionInternalTypeLabel('future-internal')).toBe('tipo desconocido');
  });
});
