# vina-studio

Let your AI agent work on the garment pattern you have open in [Vina](https://vina.sdar.dev):
read it, measure it, create pieces, sew, notch, remove and undo. Every change is one Ctrl+Z step
in Vina.

It works like Blender's MCP: your agent starts `vina-studio` on your computer, and the Vina tab
connects to it when you press «Conectar». It has no window of its own: you set it up once in your
agent and never run it by hand.

`vina-studio` runs [`vina-mcp`](https://www.npmjs.com/package/vina-mcp), the bridge itself.

## Set up your agent once

**Claude Code**

```sh
claude mcp add vina -- npx -y vina-studio
```

**Claude Desktop** (`claude_desktop_config.json`) or **Cursor** (`~/.cursor/mcp.json`), inside
`mcpServers`:

```json
"vina": { "command": "npx", "args": ["-y", "vina-studio"] }
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
- It only listens on your computer, and only accepts `https://vina.sdar.dev` as the tab. One tab
  at a time: the last one to connect wins.
- The tab only runs Vina's tool surface, the one Vina's own agent will also use: no files, no
  network, no code from the agent.
- If a call times out or the tab disconnects in the middle of one, the change may still have
  been applied. The error says so; read the pattern again before retrying.
- Requires Node 18 or newer.

## Developing Vina

To connect a Vina served from your own computer (`npm run dev`), start it with
`VINA_MCP_ALLOW_LOCAL=1`. Without it, a tab from `http://localhost` is refused: any local page
could otherwise pretend to be Vina.

License: MIT.
