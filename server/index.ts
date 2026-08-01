#!/usr/bin/env node
/**
 * Vina Local Server
 *
 * Runs on the user's machine. Serves the UI and provides:
 * - Static file serving (the built frontend)
 * - Project file I/O (save/load from filesystem)
 * - Copilot bridge (proxies to user's connected agent)
 * - WebSocket for real-time agent communication
 *
 * Usage:
 *   vina                    # start on default port 7700
 *   vina --port 8080        # custom port
 *   VINA_PORT=7700 vina     # env var
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { handleAPI } from './api.js';
import { CopilotBridge } from './copilotBridge.js';

const HOME = process.env.HOME || process.env.USERPROFILE || '.';
// Migración one-shot del dir de datos: ~/.openclo → ~/.vina (rename entero)
if (!fs.existsSync(path.join(HOME, '.vina')) && fs.existsSync(path.join(HOME, '.openclo'))) {
  fs.renameSync(path.join(HOME, '.openclo'), path.join(HOME, '.vina'));
}
const PORT = parseInt(process.env.VINA_PORT || process.env.OPENCLO_PORT || '7700', 10);
const DIST_DIR = path.resolve(import.meta.dirname, '..', 'dist');
const PROJECTS_DIR = path.join(HOME, '.vina', 'projects');

// Ensure directories exist
if (!fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// MIME types
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const copilotBridge = new CopilotBridge();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);

  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // API routes
  if (url.pathname.startsWith('/api/')) {
    return handleAPI(req, res, url, PROJECTS_DIR, copilotBridge);
  }

  // Static file serving
  let filePath = path.join(DIST_DIR, url.pathname === '/' ? 'index.html' : url.pathname);

  // SPA fallback
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// WebSocket for copilot
const wss = new WebSocketServer({ server, path: '/ws/copilot' });

wss.on('connection', (ws: WebSocket) => {
  console.log('⚡ Copilot WebSocket connected');

  ws.on('message', async (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString());
      const response = await copilotBridge.handleMessage(msg);
      ws.send(JSON.stringify(response));
    } catch (e) {
      ws.send(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown error' }));
    }
  });

  ws.on('close', () => {
    console.log('Copilot WebSocket disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║          Vina v0.11.0                 ║
  ║  http://localhost:${PORT}               ║
  ╚═══════════════════════════════════════╝

  Projects: ${PROJECTS_DIR}
  Copilot:  ws://localhost:${PORT}/ws/copilot
  API:      http://localhost:${PORT}/api/

  Connect your AI agent to the copilot endpoint.
  `);
});
