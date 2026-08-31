/**
 * #1099 — "colocar exacto… no me ha creado nada. […] no me lo crea, qué
 * ladilla. ¿No creo o los está creando y no los veo?" (María, 30:02–31:55).
 * El piquete SÍ se crea; lo que falta es que se lo digan. Copy del toast
 * de confirmación tras "Colocar exacto" — la parte que sí es unitaria sin
 * montar todo PatternEditor (la posición del modal la verifica el e2e).
 */
import { describe, it, expect } from 'vitest';
import { notchPlacedMessage } from '../notchPrecisionCopy';

describe('#1099 — notchPlacedMessage: confirma la creación con la distancia', () => {
  it('redondea al mm entero — así fue como ella lo escribió', () => {
    expect(notchPlacedMessage(500)).toBe('Piquete colocado a 500 mm');
    expect(notchPlacedMessage(200)).toBe('Piquete colocado a 200 mm');
  });

  it('redondea un decimal (el input permite pasos de 0.5mm)', () => {
    expect(notchPlacedMessage(199.7)).toBe('Piquete colocado a 200 mm');
    expect(notchPlacedMessage(0.4)).toBe('Piquete colocado a 0 mm');
  });

  it('usa el término del glosario ("piquete", nunca "notch")', () => {
    expect(notchPlacedMessage(50)).not.toMatch(/notch/i);
    expect(notchPlacedMessage(50)).toMatch(/piquete/i);
  });
});
