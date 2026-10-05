import { pushJournal, resumir } from '../../utils/telemetry/journal';
import { revisionDelProyecto } from '../../store/revisionDelProyecto';
import type { ContextoDeVerbo, Respuesta, Verbo } from './tipos';

/**
 * El paso único de toda llamada a la superficie, venga del MCP o del agente
 * de Vina (spec 2026-10-05 D4: los dos ven lo mismo). Valida, corre, deja una
 * entrada en la bitácora y devuelve la revisión del proyecto. Nada falla
 * callado (§ 5.3, regla 3): un error vuelve dicho, en inglés.
 */
export async function ejecutarVerbo(
  verbos: readonly Verbo[],
  nombre: string,
  args: unknown,
  ctx: ContextoDeVerbo,
): Promise<Respuesta> {
  const verbo = verbos.find(v => v.name === nombre);
  if (!verbo) return registrar(nombre, args, ctx, { ok: false, error: `unknown verb: ${nombre}`, revision: revisionDelProyecto() });
  const parsed = verbo.args.safeParse(args ?? {});
  if (!parsed.success) {
    const error = `invalid arguments: ${parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`;
    return registrar(nombre, args, ctx, { ok: false, error, revision: revisionDelProyecto() });
  }
  try {
    const result = await verbo.run(parsed.data, ctx);
    return registrar(nombre, args, ctx, { ok: true, result, revision: revisionDelProyecto() });
  } catch (e) {
    return registrar(nombre, args, ctx, { ok: false, error: e instanceof Error ? e.message : String(e), revision: revisionDelProyecto() });
  }
}

/** La caja negra ve toda llamada (§ 5.4): el verbo, de dónde viene, qué pidió, qué devolvió y la revisión. */
function registrar(nombre: string, args: unknown, ctx: ContextoDeVerbo, r: Respuesta): Respuesta {
  pushJournal('agente', nombre, {
    origen: ctx.origen,
    args: resumir(args),
    ok: r.ok,
    ...(r.ok ? { result: resumir(r.result) } : { error: r.error }),
    revision: r.revision,
  });
  return r;
}
