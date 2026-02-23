/**
 * Claude Bridge — minimal HTTP server that wraps `claude` CLI for OpenClo's copilot.
 *
 * Uses Claude Max subscription via the CLI (no API credits needed).
 * Streams responses as SSE (Server-Sent Events).
 *
 * Usage: node server/claude-bridge.mjs
 * Endpoint: POST /chat { message, system?, tools? }
 * Health: GET /health
 */

import { spawn } from 'child_process';
import http from 'http';

const PORT = parseInt(process.env.PORT || '3200', 10);
const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

// ─── CORS ───────────────────────────────────────────────────────────────────

function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── Body parser ────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ─── System prompt ──────────────────────────────────────────────────────────

const DEFAULT_SYSTEM = `You are an AI pattern-making assistant inside OpenClo (open-source CLO3D alternative).
You think like a patronista. You use proper pattern-making terminology.
You understand the FULL workflow: measurements → base pattern → adjustments → fitting → grading → nesting → cutting.
Default to the user's language. Spanish: use modistería terms. English: use pattern-making terms.
Expert but not condescending. Teaching mode by default — explain WHY.
Use sensible defaults: 10mm SA, grainline on center.
Keep responses concise and actionable.`;

// ─── Chat handler ───────────────────────────────────────────────────────────

async function handleChat(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { message, system, context } = body;
  if (!message) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'message field required' }));
    return;
  }

  // Build the prompt with context
  const systemPrompt = system || DEFAULT_SYSTEM;
  const fullPrompt = context
    ? `${context}\n\nUser: ${message}`
    : message;

  console.log(`[bridge] Chat request: "${message.slice(0, 80)}..." | context: ${context ? 'yes' : 'no'}`);

  // SSE headers
  setCORS(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Spawn claude CLI
  // --print: non-interactive, plain text output
  // We pipe the prompt via stdin for long messages
  const args = [
    '--print',
    '-p', systemPrompt,
    fullPrompt,
  ];

  console.log(`[bridge] Spawning: claude --print -p "..." "${fullPrompt.slice(0, 50)}..."`);

  const proc = spawn(CLAUDE_PATH, args, {
    cwd: '/tmp', // Don't scan project directory (faster startup)
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let fullContent = '';

  proc.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    fullContent += text;
    res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.includes('error') || text.includes('Error')) {
      console.error(`[bridge] stderr: ${text.trim()}`);
    }
  });

  proc.on('close', (code) => {
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
    console.log(`[bridge] Done (exit ${code}), ${fullContent.length} chars`);
  });

  proc.on('error', (err) => {
    console.error(`[bridge] Process error:`, err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  });

  // Handle client disconnect
  req.on('close', () => {
    if (!proc.killed) proc.kill('SIGTERM');
  });
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', claude: CLAUDE_PATH }));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    handleChat(req, res);
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`[bridge] Claude bridge listening on http://localhost:${PORT}`);
  console.log(`[bridge] POST /chat { message, system?, context? }`);
  console.log(`[bridge] GET  /health`);
});
