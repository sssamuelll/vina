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
const CONFIG_PATH = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.openclo', 'copilot-config.json');
const DEFAULT_CONFIG = {
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
    config;
    constructor() {
        this.config = this.loadConfig();
    }
    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_PATH)) {
                return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            }
        }
        catch { }
        return { ...DEFAULT_CONFIG };
    }
    saveConfig() {
        const dir = path.dirname(CONFIG_PATH);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    }
    getConfig() {
        return { ...this.config };
    }
    setConfig(config) {
        this.config = { ...this.config, ...config };
        this.saveConfig();
    }
    async handleMessage(msg) {
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
    async sendHTTP(msg) {
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
    async sendSubprocess(msg) {
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
            child.stdout?.on('data', (d) => stdout += d.toString());
            child.stderr?.on('data', (d) => stderr += d.toString());
            child.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`Agent exited with code ${code}: ${stderr}`));
                    return;
                }
                try {
                    // Try to find JSON in the output
                    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        resolve(this.validateResponse(JSON.parse(jsonMatch[0])));
                    }
                    else {
                        resolve({ message: stdout.trim(), commands: [] });
                    }
                }
                catch {
                    resolve({ message: stdout.trim(), commands: [] });
                }
            });
            child.on('error', reject);
        });
    }
    validateResponse(data) {
        if (typeof data?.message !== 'string')
            data.message = 'Done.';
        if (!Array.isArray(data?.commands))
            data.commands = [];
        data.commands = data.commands.filter((c) => c && typeof c.type === 'string');
        return data;
    }
}
//# sourceMappingURL=copilotBridge.js.map