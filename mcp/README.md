# vina-mcp

Let your AI agent work on the garment pattern you have open in [Vina](https://vina.sdar.dev):
read it, measure it, create pieces, sew, notch, remove and undo. Every change is one Ctrl+Z step
in Vina.

It works like Blender's MCP: your agent starts `vina-mcp` on your computer, and the Vina tab
connects to it when you press «Conectar».

## Set up your agent once

**Claude Code**

```sh
claude mcp add vina -- npx -y vina-mcp
```

**Claude Desktop** (`claude_desktop_config.json`) or **Cursor** (`~/.cursor/mcp.json`), inside
`mcpServers`:

```json
"vina": { "command": "npx", "args": ["-y", "vina-mcp"] }
```

Restart the agent after adding it.

## Connect Vina

1. Open Vina in Chrome, Edge or Brave.
2. Click the plug icon next to «IA» and press «Conectar».
3. The first time, the browser asks whether Vina may access other apps and services on this
   device. Choose «Permitir» (Allow).

## How it works

- `vina-mcp` speaks MCP over stdio with your agent and waits for the Vina tab on
  `ws://127.0.0.1:8462` (set `VINA_MCP_PORT` to change it).
- It only listens on your computer, and only accepts Vina as the tab. One tab at a time: the
  last one to connect wins.
- The tab runs the same tools Vina's own agent uses. Nothing else: no files, no network, no
  code from the agent.
- Requires Node 18 or newer.

License: MIT.
