/**
 * REST API for project management + copilot
 * 
 * Routes:
 *   GET    /api/projects          — list saved projects
 *   GET    /api/projects/:id      — load project
 *   POST   /api/projects          — save new project
 *   PUT    /api/projects/:id      — update project
 *   DELETE /api/projects/:id      — delete project
 *   POST   /api/copilot           — send message to connected agent
 *   GET    /api/copilot/config    — get agent config
 *   PUT    /api/copilot/config    — set agent config
 *   POST   /api/export/dxf        — export pieces to DXF file
 *   POST   /api/export/pdf        — export pieces to PDF file
 *   GET    /api/health            — health check
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { CopilotBridge } from './copilotBridge.js';

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => body += chunk.toString());
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export async function handleAPI(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  projectsDir: string,
  copilotBridge: CopilotBridge,
) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  // ─── Health ───
  if (pathname === '/api/health') {
    return json(res, { status: 'ok', version: '0.4.0' });
  }

  // ─── Projects ───
  // Dual-read: '.vina' is canonical (what we now write), '.openclo' is the
  // legacy extension — existing files must keep opening forever (Task 5).
  if (pathname === '/api/projects' && method === 'GET') {
    const files = fs.readdirSync(projectsDir).filter(f => f.endsWith('.vina') || f.endsWith('.openclo'));
    const projects = files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(projectsDir, f), 'utf-8'));
        return {
          id: data.id || path.basename(f, path.extname(f)),
          name: data.name || f,
          filename: f,
          updatedAt: data.updatedAt,
        };
      } catch {
        return { id: f, name: f, filename: f };
      }
    });
    return json(res, projects);
  }

  if (pathname.startsWith('/api/projects/') && method === 'GET') {
    const id = pathname.split('/')[3];
    let filePath = path.join(projectsDir, `${id}.vina`);
    if (!fs.existsSync(filePath)) filePath = path.join(projectsDir, `${id}.openclo`);
    if (!fs.existsSync(filePath)) return json(res, { error: 'Not found' }, 404);
    const data = fs.readFileSync(filePath, 'utf-8');
    return json(res, JSON.parse(data));
  }

  if (pathname === '/api/projects' && method === 'POST') {
    const body = await readBody(req);
    const project = JSON.parse(body);
    const id = project.id || `project-${Date.now()}`;
    project.id = id;
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(projectsDir, `${id}.vina`), JSON.stringify(project, null, 2));
    const legacyPath = path.join(projectsDir, `${id}.openclo`);
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
    return json(res, { id, saved: true }, 201);
  }

  if (pathname.startsWith('/api/projects/') && method === 'PUT') {
    const id = pathname.split('/')[3];
    const body = await readBody(req);
    const project = JSON.parse(body);
    project.id = id;
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(path.join(projectsDir, `${id}.vina`), JSON.stringify(project, null, 2));
    const legacyPath = path.join(projectsDir, `${id}.openclo`);
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
    return json(res, { id, saved: true });
  }

  if (pathname.startsWith('/api/projects/') && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const vinaPath = path.join(projectsDir, `${id}.vina`);
    const legacyPath = path.join(projectsDir, `${id}.openclo`);
    if (fs.existsSync(vinaPath)) fs.unlinkSync(vinaPath);
    if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
    return json(res, { deleted: true });
  }

  // ─── Copilot ───
  if (pathname === '/api/copilot' && method === 'POST') {
    const body = await readBody(req);
    const msg = JSON.parse(body);
    try {
      const response = await copilotBridge.handleMessage(msg);
      return json(res, response);
    } catch (e) {
      return json(res, { error: e instanceof Error ? e.message : 'Unknown error' }, 500);
    }
  }

  if (pathname === '/api/copilot/config' && method === 'GET') {
    return json(res, copilotBridge.getConfig());
  }

  if (pathname === '/api/copilot/config' && method === 'PUT') {
    const body = await readBody(req);
    const config = JSON.parse(body);
    copilotBridge.setConfig(config);
    return json(res, { saved: true });
  }

  // ─── 404 ───
  return json(res, { error: 'Not found' }, 404);
}
