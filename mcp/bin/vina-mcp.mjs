#!/usr/bin/env node
// vina-mcp: el puente entre tu agente (MCP por stdio) y la pestaña de Vina
// (WebSocket en 127.0.0.1). Spec: docs/superpowers/specs/2026-10-09-puente-mcp-design.md
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { crearProtocolo } from '../src/protocolo.mjs';
import { crearPuente } from '../src/puente.mjs';

const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
const { version } = leer('../package.json');
let superficie = leer('../superficie.json');
const puerto = Number(process.env.VINA_MCP_PORT || 8462);
// stdout es del protocolo: lo demás va a stderr.
const registrar = (...m) => console.error('[vina-mcp]', ...m);

const protocolo = crearProtocolo({
  version,
  superficie: () => superficie,
  llamar: (verbo, args) => puente.llamar(verbo, args),
  presentarse: (cliente) => puente.presentarAgente(cliente),
  enviar: (m) => process.stdout.write(JSON.stringify(m) + '\n'),
});
const puente = crearPuente({
  puerto,
  superficie,
  registrar,
  alCambiarSuperficie: (s) => {
    superficie = s;
    protocolo.avisarListaCambiada();
  },
});

await puente.escuchar();
const lineas = createInterface({ input: process.stdin });
lineas.on('line', (l) => { void protocolo.recibir(l); });
// El agente se fue: el puente se va con él y suelta el puerto.
lineas.on('close', () => { void puente.cerrar().then(() => process.exit(0)); });
