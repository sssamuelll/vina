/**
 * #1099 — "colocar exacto… no me ha creado nada. […] no me lo crea, qué
 * ladilla. ¿No creo o los está creando y no los veo?" (María, 30:02–31:55).
 * El piquete SÍ se crea; lo que falta es que se lo digan. Copy del toast
 * de confirmación tras "Colocar exacto" — la parte que sí es unitaria sin
 * montar todo PatternEditor (la posición del modal la verifica el e2e).
 *
 * Ronda 2 (hallazgo del review adversarial, Serrano): `Math.round` mentía
 * sobre un valor válido de 0.5mm — 199,5mm (el input acepta pasos de 0.5)
 * se confirmaba como "200 mm", un número que ella nunca escribió.
 */
import { describe, it, expect } from 'vitest';
import { notchPlacedMessage } from '../notchPrecisionCopy';

describe('#1099 — notchPlacedMessage: confirma la creación con la distancia EXACTA', () => {
  it('un entero se muestra sin decimales', () => {
    expect(notchPlacedMessage(500)).toBe('Piquete colocado a 500 mm');
    expect(notchPlacedMessage(200)).toBe('Piquete colocado a 200 mm');
    expect(notchPlacedMessage(0)).toBe('Piquete colocado a 0 mm');
  });

  it('un paso de 0.5mm (lo único que el input permite fuera del entero) se conserva, no se redondea', () => {
    expect(notchPlacedMessage(199.5)).toBe('Piquete colocado a 199.5 mm');
    expect(notchPlacedMessage(0.5)).toBe('Piquete colocado a 0.5 mm');
  });

  it('tolera ruido de punto flotante sin inventar un tercer decimal', () => {
    expect(notchPlacedMessage(199.49999999999997)).toBe('Piquete colocado a 199.5 mm');
  });

  it('usa el término del glosario ("piquete", nunca "notch")', () => {
    expect(notchPlacedMessage(50)).not.toMatch(/notch/i);
    expect(notchPlacedMessage(50)).toMatch(/piquete/i);
  });
});
