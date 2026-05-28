#!/usr/bin/env node
/**
 * M2 prompt dry-run — feeds the dressing-intent system prompt + the relevant
 * tool descriptions to `claude --print` and observes which tool the LLM
 * would call first, whether it stops to ask confirmation, and how it would
 * resume after a "sí".
 *
 * This is NOT a replacement for testing inside the real AgenticLoop — it
 * tests prompt comprehension only. Tool execution, knowledge retrieval,
 * and provider-specific quirks are out of scope here. But it's the
 * fastest honest check that the prompt biases the LLM toward the right
 * tool sequence before paying for an end-to-end browser dry-run.
 *
 * Usage: node scripts/m2-prompt-dry-run.mjs
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Build the prompt the AgenticLoop would feed the LLM ─────────────────────

const bootstrapSrc = readFileSync(
  new URL('../src/copilot/reasoning/bridge/domainBootstrap.ts', import.meta.url),
  'utf8',
);
const match = bootstrapSrc.match(/return\s+`([\s\S]*?)`;\s*\}/);
if (!match) {
  console.error('Could not extract prompt from domainBootstrap.ts');
  process.exit(2);
}
const domainPrompt = match[1];

const ACTION_TOOLS = `
## Action Tools (modify garment)
- **listSeamlyPatterns**: List all available Seamly2D patterns — real patterns designed by professional pattern makers. These are converted from .sm2d files with full construction geometry. / Listar patrones Seamly2D disponibles.
- **loadSeamlyPattern**: Load a Seamly2D pattern into the editor. Resolves all construction geometry and builds pattern pieces. These are REAL patterns from professional pattern makers — much better than hand-built blueprints. / Cargar un patrón Seamly2D en el editor. Parameters: { patternId: string, clearFirst?: boolean, autoSew?: boolean, simulate?: boolean }
- **runGarmentPipeline**: Run the full garment pipeline on currently loaded pieces: auto-detect seams → apply high-confidence seams → start 3D simulation. Call this AFTER loading a pattern (loadSeamlyPattern or blueprint). / Ejecutar pipeline completo: auto-detectar costuras → aplicar → iniciar simulación 3D. Parameters: { minConfidence?: number, skipSimulation?: boolean, skipAutoSew?: boolean }
- **getGarmentState** (read-only): Inspect current pieces and seams in the project.
- **searchPieces** (read-only): Search loaded pieces by name or type.
`;

const META_INSTRUCTION = `

## Dry-run mode (this conversation is NOT inside the live agentic loop)
You are being tested OUTSIDE the live tool-execution loop. There is no real tool registry attached. Respond as you normally would inside the loop: name the exact tool call you would make next (name + arguments as JSON), followed by any text you would say to the user. If your next step is to wait for user confirmation, say so explicitly and emit no tool call.

Format your response as:

  TOOL_CALL: <toolName>
  ARGS: <JSON args>
  USER_MESSAGE: <what you'd say to the user>

Or if you would wait for the user:

  TOOL_CALL: (none — waiting for user confirmation)
  USER_MESSAGE: <your proposal in Spanish>

Do not narrate your reasoning. Just emit the format above. Keep USER_MESSAGE short — one or two sentences.
`;

const systemPrompt = domainPrompt + ACTION_TOOLS + META_INSTRUCTION;

// ─── Conversation turns ──────────────────────────────────────────────────────

const TURNS = [
  {
    label: 'Turn 1 — initial intent',
    user: 'Quiero vestir el avatar con una camisa.',
  },
  {
    label: 'Turn 1.5 — listSeamlyPatterns just returned, no user message yet (THE confirmation-gate test)',
    user: `Conversation so far:
[User]: Quiero vestir el avatar con una camisa.
[You called]: listSeamlyPatterns({})
[Tool result]: { patterns: [{id: "male_shirt", name: "Male Shirt", pieces: 17}, {id: "tshirt", name: "Tshirt", pieces: 5}, {id: "pajama_top", name: "Pajama Top", pieces: 8}], total: 3 }

What is your next action? The user has NOT sent a new message — you have just received the tool result and must decide whether to emit another tool call or pause to ask the user. Per your system prompt step 3, what do you do?`,
  },
  {
    label: 'Turn 2 — listSeamlyPatterns returned, user has confirmed',
    user: `Conversation so far:
[User]: Quiero vestir el avatar con una camisa.
[You called]: listSeamlyPatterns({})
[Tool result]: { patterns: [{id: "male_shirt", name: "Male Shirt", pieces: 17}, {id: "tshirt", name: "Tshirt", pieces: 5}, {id: "pajama_top", name: "Pajama Top", pieces: 8}], total: 3 }
[You said]: "Tengo Male Shirt en el catálogo (17 piezas). ¿La uso?"
[User now says]: Sí, úsala.

What is your next action?`,
  },
  {
    label: 'Turn 3 — loadSeamlyPattern succeeded, no user message',
    user: `Conversation so far:
[User]: Quiero vestir el avatar con una camisa.
[You called]: listSeamlyPatterns({})
[You said]: "Tengo Male Shirt en el catálogo (17 piezas). ¿La uso?"
[User]: Sí, úsala.
[You said]: "Cargando piezas…"
[You called]: loadSeamlyPattern({ patternId: "male_shirt", clearFirst: true, autoSew: false, simulate: false })
[Tool result]: { success: true, data: { pieces: 17, seams: 0 } }

What is your next action? (The user has not sent a new message — you are mid-flow.)`,
  },
];

// ─── Execution ───────────────────────────────────────────────────────────────

const tmpRoot = mkdtempSync(join(tmpdir(), 'm2-dryrun-'));
const sysFile = join(tmpRoot, 'system.txt');
writeFileSync(sysFile, systemPrompt, 'utf8');

function runTurn(userMsg) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'claude',
      ['--print', '--system-prompt-file', sysFile, userMsg],
      { stdio: ['ignore', 'pipe', 'pipe'], shell: false },
    );
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c.toString(); });
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 500)}`));
      } else {
        resolve(stdout.trim());
      }
    });
    proc.on('error', reject);
  });
}

(async () => {
  console.log('M2 prompt dry-run — feeding the dressing-intent prompt to claude CLI\n');
  console.log(`System prompt: ${systemPrompt.length} chars, written to ${sysFile}\n`);
  console.log('═'.repeat(72));

  try {
    for (const turn of TURNS) {
      console.log(`\n▸ ${turn.label}`);
      console.log('─'.repeat(72));
      try {
        const out = await runTurn(turn.user);
        console.log(out);
      } catch (err) {
        console.error(`✗ Failed: ${err.message}`);
      }
      console.log('═'.repeat(72));
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
})();
