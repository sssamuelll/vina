/**
 * Copilot Bridge — server-side proxy between OpenClo and the user's AI agent
 * 
 * Supports connecting to:
 * - Claude Code (via stdio/subprocess)
 * - Codex CLI (via stdio/subprocess)
 * - HTTP API (any REST endpoint)
 * - Custom agents via stdin/stdout protocol
 * 
 * The bridge is the security boundary — it controls what the agent can access.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface BridgeConfig {
  /** Agent type */
  agentType: 'none' | 'http' | 'subprocess' | 'custom';
  /** HTTP endpoint for HTTP agents */
  httpEndpoint?: string;
  /** Custom headers */
  httpHeaders?: Record<string, string>;
  /** Subprocess command for CLI agents (e.g., 'claude', 'codex') */
  command?: string;
  /** Args */
  args?: string[];
  /** Name for display */
  name: string;
}

interface CopilotResponse {
  message: string;
  commands: Array<{ type: string; [key: string]: unknown }>;
}

const CONFIG_PATH = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.openclo',
  'copilot-config.json',
);

const DEFAULT_CONFIG: BridgeConfig = {
  agentType: 'none',
  name: 'No Agent Connected',
};

const SYSTEM_PROMPT = `You are an AI pattern making copilot inside OpenClo, an open-source 2D/3D garment design application.

You receive a JSON context with the current project state (pieces, measurements, selection) and a user message.
You respond with JSON containing "message" (string explanation) and "commands" (array of actions to execute).

COORDINATE SYSTEM: 1 unit = 1mm. Origin (0,0) = top-left. X→right, Y→down.

PATHCOMMAND FORMAT (SVG-like):
- { type: "M", values: [x, y] } — move to
- { type: "L", values: [x, y] } — line to
- { type: "C", values: [cx1, cy1, cx2, cy2, x, y] } — cubic bezier
- { type: "Z", values: [] } — close path

COMMAND TYPES:
- create_piece: { type: "create_piece", piece: { name, outline: PathCommand[], internals: [], position: {x,y}, rotation: 0, mirrored: false, seamAllowance: 10 } }
- modify_outline: { type: "modify_outline", pieceId: "...", outline: PathCommand[] }
- move_piece: { type: "move_piece", pieceId: "...", position: {x, y} }
- rename_piece: { type: "rename_piece", pieceId: "...", name: "..." }
- set_seam_allowance: { type: "set_seam_allowance", pieceId: "...", mm: 10 }
- add_internal: { type: "add_internal", pieceId: "...", line: { type: "dart"|"grainline"|"notch", path: PathCommand[] } }
- delete_piece: { type: "delete_piece", pieceId: "..." }
- scale_piece: { type: "scale_piece", pieceId: "...", factor: 1.1 }
- message: { type: "message", text: "..." } — just text, no action

Use realistic garment dimensions in mm. Standard seam allowance: 10mm.
Response must be valid JSON: { "message": "...", "commands": [...] }`;

export class CopilotBridge {
  private config: BridgeConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): BridgeConfig {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      }
    } catch { /* Use defaults if config file cannot be read */ }
    return { ...DEFAULT_CONFIG };
  }

  private saveConfig() {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  getConfig(): BridgeConfig {
    return { ...this.config };
  }

  setConfig(config: Partial<BridgeConfig>) {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }

  async handleMessage(msg: { context: Record<string, unknown>; system?: string }): Promise<CopilotResponse> {
    switch (this.config.agentType) {
      case 'http':
        return this.sendHTTP(msg);
      case 'subprocess':
        return this.sendSubprocess(msg);
      case 'none':
      default:
        return {
          message: 'No AI agent connected. Go to Settings → Agent Configuration to connect Claude Code, Codex, or another agent.',
          commands: [],
        };
    }
  }

  private async sendHTTP(msg: Record<string, unknown>): Promise<CopilotResponse> {
    if (!this.config.httpEndpoint) {
      throw new Error('No HTTP endpoint configured');
    }

    const body = JSON.stringify({
      system: SYSTEM_PROMPT,
      ...msg,
    });

    const response = await fetch(this.config.httpEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.httpHeaders || {}),
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Agent returned ${response.status}`);
    }

    const data = await response.json();
    return this.validateResponse(data);
  }

  private async sendSubprocess(msg: { context?: { message?: string } }): Promise<CopilotResponse> {
    // For CLI agents like claude/codex, we send the context as a prompt
    // and parse the JSON response from stdout
    const { spawn } = await import('node:child_process');
    const command = this.config.command || 'echo';
    const args = this.config.args || [];

    const prompt = `${SYSTEM_PROMPT}\n\n---\n\nContext:\n${JSON.stringify(msg.context, null, 2)}\n\nUser message: ${msg.context?.message || ''}\n\nRespond with JSON only.`;

    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args, prompt], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (d: Buffer) => stdout += d.toString());
      child.stderr?.on('data', (d: Buffer) => stderr += d.toString());

      child.on('close', (code: number) => {
        if (code !== 0) {
          reject(new Error(`Agent exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          // Try to find JSON in the output
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            resolve(this.validateResponse(JSON.parse(jsonMatch[0])));
          } else {
            resolve({ message: stdout.trim(), commands: [] });
          }
        } catch {
          resolve({ message: stdout.trim(), commands: [] });
        }
      });

      child.on('error', reject);
    });
  }

  private validateResponse(data: Record<string, unknown>): CopilotResponse {
    const message = typeof data?.message === 'string' ? data.message : 'Done.';
    const rawCommands = Array.isArray(data?.commands) ? data.commands : [];
    const commands = rawCommands.filter(
      (c): c is { type: string; [key: string]: unknown } =>
        c != null && typeof c === 'object' && typeof (c as Record<string, unknown>).type === 'string'
    );
    return { message, commands };
  }
}
