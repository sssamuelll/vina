# vina-mcp

The bridge inside [`vina-studio`](https://www.npmjs.com/package/vina-studio): it speaks MCP over
stdio with your AI agent and waits for the [Vina](https://vina.sdar.dev) tab on
`ws://127.0.0.1:8462`.

To set up your agent, use `vina-studio`; its README has the steps:

```sh
claude mcp add vina -- npx -y vina-studio
```

Settings, as environment variables:

- `VINA_MCP_PORT`: the port to listen on (8462 by default).
- `VINA_MCP_ALLOW_LOCAL=1`: also accept a Vina served from your own computer (`npm run dev`).
  Without it only `https://vina.sdar.dev` is accepted: any local page could otherwise pretend to
  be Vina.

License: MIT.
