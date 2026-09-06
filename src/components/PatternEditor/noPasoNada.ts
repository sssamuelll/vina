import { pushJournal } from '../../utils/telemetry/journal';

/**
 * "No pasó nada": el desenlace de un gesto 2D que se armó y murió sin dejar
 * rastro (hallazgo G de la revisión adversarial del 2026-09-04, #1117).
 *
 * El censo del 09-05 separó ~96 `return` tempranos de los 26 hooks de gesto y
 * dejó 20 mudas de verdad. El peor grupo no es "falta seleccionar": es el
 * gesto que muere DESPUÉS de armarse — María apretó sobre un borde real, el
 * hit-test acertó, soltó, y no apareció ni el piquete ni un aviso.
 *
 * Canal: bitácora siempre, tira para las accionables, toast nunca. Un gesto
 * que no pasó nada se repite cinco veces en tres segundos, y serían cinco
 * toasts encima del lienzo; la tira ya tiene sus ranuras de texto y no
 * interrumpe.
 */

export const RAZONES = [
  'notch:sin-sitio',
  'notch:sin-emplazamiento',
  'notch:ancla-perdida',
  'tijeras:corte-no-cruza',
  'point:sin-comando',
  'walkseam:borde-sin-resolver',
  'trim:borde-sin-largo',
  'grainline:fuera-de-pieza',
  'pespunte:tramo-invalido',
  'pespunte:desplazamiento-no-cabe',
  'margen:borde-sin-anillo',
  'margen:pieza-bloqueada',
  'costuras:borde-sin-costura',
  'unir:misma-pieza',
  'rectangulo:medida-en-cero',
  'circulo:medida-en-cero',
  'triangulo:medida-en-cero',
  'pom:nombre-abierto',
  'abrir:linea-invalida',
] as const;

export type RazonMuda = (typeof RAZONES)[number];

export interface AvisoMudo {
  razon: RazonMuda;
  texto: string;
  t: number;
}

/**
 * Cada mensaje dice QUÉ HACER, no solo qué falló: un texto que solo nombra el
 * fallo deja a María igual de trabada. `Record<RazonMuda, string>` es lo que
 * obliga a que una razón nueva nazca con su mensaje.
 */
const MENSAJES: Record<RazonMuda, string> = {
  'notch:sin-sitio': 'No cabe un piquete ahí; prueba un poco más adentro del borde',
  'notch:sin-emplazamiento': 'El piquete no encontró dónde pararse; suelta más cerca del borde',
  'notch:ancla-perdida': 'El contorno cambió y el piquete perdió su esquina de referencia; colócalo otra vez con un clic',
  'tijeras:corte-no-cruza': 'La línea de corte tiene que entrar por un lado y salir por otro; arrastra de borde a borde',
  'point:sin-comando': 'Ese tramo no acepta un punto; prueba sobre otro lado de la pieza',
  'walkseam:borde-sin-resolver': 'Ese borde ya no está en el lienzo; prueba con otro lado de la pieza',
  'trim:borde-sin-largo': 'Ese borde no tiene largo; elige uno de los lados de la pieza',
  'grainline:fuera-de-pieza': 'El hilo se dibuja dentro de una pieza; arrastra desde adentro',
  'pespunte:tramo-invalido': 'Marca el segundo punto en el mismo borde y separado del primero',
  'pespunte:desplazamiento-no-cabe': 'El desplazamiento no cabe en ese borde; reduce la distancia en la tira',
  'margen:borde-sin-anillo': 'Ese borde no se pudo leer; toca otra vez sobre el contorno de la pieza',
  'margen:pieza-bloqueada': 'Esa pieza está bloqueada; quítale el candado y prueba otra vez',
  'costuras:borde-sin-costura': 'Ese borde todavía no tiene costura; usa Coser para hacerla y vuelve aquí',
  'unir:misma-pieza': 'Esa ya es la primera pieza; elige la segunda para unirlas',
  'rectangulo:medida-en-cero': 'El rectángulo mide cero; escribe un ancho y un alto mayores que cero',
  'circulo:medida-en-cero': 'El círculo mide cero; escribe un radio mayor que cero',
  'triangulo:medida-en-cero': 'El triángulo mide cero; escribe una base y una altura mayores que cero',
  'pom:nombre-abierto': 'Primero ponle nombre a la medida; escribe y pulsa Enter, o Escape para dejarlo',
  'abrir:linea-invalida': 'Esa línea no corta la pieza en dos; arrastra de un borde al otro',
};

export function mensajeDe(razon: RazonMuda): string {
  return MENSAJES[razon];
}

type Oyente = (aviso: AvisoMudo) => void;

const oyentes = new Set<Oyente>();

/** Devuelve la función para cancelar la suscripción. */
export function suscribirNoPasoNada(fn: Oyente): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function noPasoNada(razon: RazonMuda, data?: Record<string, unknown>): void {
  // La bitácora primero y siempre: `gesture` está en UNFUSED a propósito
  // (journal.ts:47), así que repetir el mismo gesto deja una línea por vez.
  pushJournal('gesture', 'no-paso-nada', { razon, ...data });
  const aviso: AvisoMudo = { razon, texto: mensajeDe(razon), t: Date.now() };
  for (const fn of oyentes) {
    try {
      fn(aviso);
    } catch {
      // El gesto ya ocurrió; la tira es decoración del desenlace y no puede
      // tumbarlo por reventar al pintarse.
    }
  }
}
