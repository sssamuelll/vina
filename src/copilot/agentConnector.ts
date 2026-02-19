/**
 * Agent Connector — handles communication with external AI agents
 * 
 * Supports:
 * - HTTP POST (Claude Code, Codex, any REST API)
 * - WebSocket (persistent connection agents)
 * - Built-in (offline parametric templates)
 */

import { AgentConfig, CopilotContext, CopilotResponse, DEFAULT_SYSTEM_PROMPT } from './protocol';

// ─── Server-side Agent (via local server API) ───

export async function sendViaServer(context: CopilotContext): Promise<CopilotResponse> {
  const baseUrl = window.location.origin;
  const response = await fetch(`${baseUrl}/api/copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server error ${response.status}: ${text}`);
  }

  return response.json();
}

// ─── HTTP Agent ───

async function sendHTTP(config: AgentConfig, context: CopilotContext): Promise<CopilotResponse> {
  if (!config.endpoint) throw new Error('No endpoint configured');

  const body = {
    system: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    context,
  };

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...config.headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return validateResponse(data);
}

// ─── WebSocket Agent ───

let ws: WebSocket | null = null;
let wsResolve: ((r: CopilotResponse) => void) | null = null;

function connectWS(endpoint: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    socket.onopen = () => resolve(socket);
    socket.onerror = (e) => reject(e);
    socket.onmessage = (event) => {
      if (wsResolve) {
        try {
          const data = JSON.parse(event.data);
          wsResolve(validateResponse(data));
        } catch (e) {
          wsResolve({ message: event.data, commands: [] });
        }
        wsResolve = null;
      }
    };
  });
}

async function sendWS(config: AgentConfig, context: CopilotContext): Promise<CopilotResponse> {
  if (!config.endpoint) throw new Error('No endpoint configured');

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    ws = await connectWS(config.endpoint);
  }

  return new Promise((resolve, reject) => {
    wsResolve = resolve;
    const timeout = setTimeout(() => {
      wsResolve = null;
      reject(new Error('Agent timeout (30s)'));
    }, 30000);

    ws!.send(JSON.stringify({
      system: config.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      context,
    }));

    // Clean up timeout on resolve
    const origResolve = wsResolve;
    wsResolve = (r) => {
      clearTimeout(timeout);
      origResolve?.(r);
    };
  });
}

/** Strip id/createdAt/updatedAt from a generated piece for create_piece command */
function stripPiece(p: any): Omit<import('../types/types').PatternPiece, 'id' | 'createdAt' | 'updatedAt'> {
  const { id, createdAt, updatedAt, ...rest } = p;
  return rest;
}

// ─── Built-in Agent (offline, template-based) ───

async function sendBuiltin(_config: AgentConfig, context: CopilotContext): Promise<CopilotResponse> {
  const msg = context.message.toLowerCase();

  // Simple keyword matching for common requests
  if (msg.includes('bodice') || msg.includes('corpiño') || msg.includes('blusa')) {
    const { generateBodiceBack, generateBodiceFront } = await import('../utils/patternTemplates');
    const m = context.project.measurements as any;
    const back = generateBodiceBack(m);
    const front = generateBodiceFront(m);
    return {
      message: `Generated bodice block (front + back) for ${m.chest}cm chest, ${m.waist}cm waist.`,
      commands: [
        { type: 'create_piece', piece: stripPiece(back) },
        { type: 'create_piece', piece: stripPiece(front) },
      ],
    };
  }

  if (msg.includes('sleeve') || msg.includes('manga')) {
    const { generateSleeve } = await import('../utils/patternTemplates');
    const m = context.project.measurements as any;
    const sleeve = generateSleeve(m);
    return {
      message: `Generated sleeve for ${m.armLength}cm arm length.`,
      commands: [
        { type: 'create_piece', piece: stripPiece(sleeve) },
      ],
    };
  }

  if (msg.includes('skirt') || msg.includes('falda')) {
    const { generateSkirtFront, generateSkirtBack } = await import('../utils/patternTemplates');
    const m = context.project.measurements as any;
    const front = generateSkirtFront(m);
    const back = generateSkirtBack(m);
    return {
      message: `Generated A-line skirt (front + back) for ${m.waist}cm waist, ${m.hips}cm hips.`,
      commands: [
        { type: 'create_piece', piece: stripPiece(front) },
        { type: 'create_piece', piece: stripPiece(back) },
      ],
    };
  }

  if (msg.includes('pants') || msg.includes('pantalón') || msg.includes('trouser')) {
    const { generatePantsFront, generatePantsBack } = await import('../utils/patternTemplates');
    const m = context.project.measurements as any;
    const front = generatePantsFront(m);
    const back = generatePantsBack(m);
    return {
      message: `Generated trouser block (front + back) for ${m.waist}cm waist, ${m.inseam}cm inseam.`,
      commands: [
        { type: 'create_piece', piece: stripPiece(front) },
        { type: 'create_piece', piece: stripPiece(back) },
      ],
    };
  }

  if (msg.includes('collar') || msg.includes('cuello')) {
    const { generateCollar } = await import('../utils/patternTemplates');
    const m = context.project.measurements as any;
    const collar = generateCollar(m);
    return {
      message: `Generated shirt collar.`,
      commands: [
        { type: 'create_piece', piece: stripPiece(collar) },
      ],
    };
  }

  // Modify selected piece
  if (context.selectedPieceIds.length > 0) {
    const selectedId = context.selectedPieceIds[0];
    const piece = context.project.pieces.find(p => p.id === selectedId);

    if (piece && (msg.includes('longer') || msg.includes('más largo') || msg.includes('alargar'))) {
      return {
        message: `I'll need an AI agent connected to modify piece outlines. Connect one via Settings → Agent Configuration.`,
        commands: [],
      };
    }

    if (piece && (msg.includes('shorter') || msg.includes('más corto') || msg.includes('acortar'))) {
      return {
        message: `I'll need an AI agent connected to modify piece outlines. Connect one via Settings → Agent Configuration.`,
        commands: [],
      };
    }
  }

  return {
    message: `I understand your request, but for complex modifications I need an external AI agent connected. Go to Settings → Agent Configuration to connect Claude Code, Codex, or another agent. For quick patterns, try: "generate bodice", "generate sleeve", "generate skirt", "generate pants", "generate collar".`,
    commands: [],
  };
}


// ─── Response Validation ───

function validateResponse(data: any): CopilotResponse {
  if (typeof data.message !== 'string') {
    data.message = 'Done.';
  }
  if (!Array.isArray(data.commands)) {
    data.commands = [];
  }
  // Validate each command has a type
  data.commands = data.commands.filter((c: any) => c && typeof c.type === 'string');
  return data as CopilotResponse;
}

// ─── Main Send Function ───

export async function sendToAgent(config: AgentConfig, context: CopilotContext): Promise<CopilotResponse> {
  switch (config.type) {
    case 'http': return sendHTTP(config, context);
    case 'websocket': return sendWS(config, context);
    case 'builtin': return sendBuiltin(config, context);
    default: throw new Error(`Unknown agent type: ${config.type}`);
  }
}

export function disconnectAgent() {
  if (ws) {
    ws.close();
    ws = null;
  }
}
