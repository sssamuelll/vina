/** Los buffers de todos los arreglos tipados de un valor, sin repetir: viajan transferidos en un postMessage. */
export function transferibles(v: unknown, vistos = new Set<ArrayBuffer>()): ArrayBuffer[] {
  if (ArrayBuffer.isView(v)) vistos.add(v.buffer as ArrayBuffer);
  else if (Array.isArray(v)) v.forEach((x) => transferibles(x, vistos));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => transferibles(x, vistos));
  return [...vistos];
}
