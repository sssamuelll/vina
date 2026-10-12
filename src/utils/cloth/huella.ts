/**
 * Huella de contenido: 64 bits (dos mezclas de 32 con constantes distintas,
 * estilo FNV-1a) de todo lo que hay en los valores, recorrido en profundidad.
 * Los arreglos tipados se leen por sus bits, en palabras de 32 cuando se puede;
 * los números sueltos, por los de su Float64 (así -0 y +0 difieren); las
 * claves de un objeto, en orden alfabético, y un campo undefined no cuenta.
 * Es la clave de las cachés del arranque: dos entradas con la misma huella
 * dan el mismo armado.
 */
export function huella(...valores: unknown[]): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  const mezclar = (w: number) => {
    a = Math.imul(a ^ w, 0x01000193);
    b = Math.imul(b ^ w, 0x5bd1e995);
    b ^= b >>> 13;
  };
  const f64 = new Float64Array(1);
  const bits = new Uint32Array(f64.buffer);
  const texto = (s: string) => {
    mezclar(s.length);
    for (let i = 0; i < s.length; i++) mezclar(s.charCodeAt(i));
  };
  const recorrer = (v: unknown): void => {
    if (v === null) return mezclar(1);
    if (v === undefined) return mezclar(2);
    if (typeof v === 'number') { f64[0] = v; mezclar(3); mezclar(bits[0]); return mezclar(bits[1]); }
    if (typeof v === 'boolean') return mezclar(v ? 4 : 5);
    if (typeof v === 'string') { mezclar(6); return texto(v); }
    if (ArrayBuffer.isView(v)) {
      texto(v.constructor.name);
      mezclar(v.byteLength);
      const vista = v.byteOffset % 4 === 0 && v.byteLength % 4 === 0
        ? new Uint32Array(v.buffer, v.byteOffset, v.byteLength / 4)
        : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      for (let i = 0; i < vista.length; i++) mezclar(vista[i]);
      return;
    }
    if (Array.isArray(v)) { mezclar(7); mezclar(v.length); for (const x of v) recorrer(x); return; }
    if (v instanceof Map) { mezclar(8); return recorrer([...v.entries()]); }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const claves = Object.keys(o).filter((k) => o[k] !== undefined).sort();
      mezclar(9);
      mezclar(claves.length);
      for (const k of claves) { texto(k); recorrer(o[k]); }
      return;
    }
    throw new Error(`huella: no sé recorrer un ${typeof v}`);
  };
  for (const v of valores) recorrer(v);
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
