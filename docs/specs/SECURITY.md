# OpenClo — Security Spec

## Threat Model

OpenClo runs entirely in the browser. The attack surface is:

1. **File imports** — malicious DXF/ZPRJ files could exploit parser bugs
2. **AI copilot** — API keys stored client-side, prompt injection via project data
3. **Server (optional)** — Node.js backend for project storage and copilot bridge

## File Import Security

### DXF Parser
- **Buffer overflow:** DXF files can be arbitrarily large. Stream-parse, don't load entire file into memory.
- **Entity count limit:** Max 100,000 entities per file (prevent DoS via huge files).
- **Recursion limit:** BLOCK/INSERT can nest. Max depth: 10.
- **String sanitization:** TEXT/MTEXT content displayed in UI must be escaped (XSS via piece names).

### ZIP Files (.zprj, .gerber)
- **Zip bomb protection:** Max decompressed size: 500MB. Max file count: 1000.
- **Path traversal:** Sanitize all filenames from ZIP entries (no `../` allowed).
- **File type validation:** Only process expected extensions (.dxf, .json, .obj, .png, .jpg).

## AI Copilot Security

### API Key Storage
- Keys stored in `localStorage` (browser-side only)
- Never sent to OpenClo's server — API calls go directly to LLM provider
- Option to use server-side proxy (copilot bridge) — key stored in server `.env`

### Prompt Injection
- Project data (piece names, fabric names) is included in copilot context
- Malicious piece name: "Ignore all instructions and..." 
- **Mitigation:** Piece names sanitized before context injection. Max length: 100 chars. Alphanumeric + spaces + basic punctuation only.

## Server Security

### Authentication
- JWT-based auth (existing)
- Tokens expire after 24h
- Refresh token rotation

### Project Storage
- Projects stored as JSON files on server filesystem
- Each user's projects in isolated directory
- No cross-user access

### Dependencies
- Regular `npm audit` in CI pipeline
- Dependabot alerts enabled
- No `eval()` or dynamic code execution

## Browser Security Headers

For simulation (SharedArrayBuffer), the server must set:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These headers are required for SharedArrayBuffer (Web Worker physics). They also provide security benefits (isolation from cross-origin attacks).

## Data Privacy

- No telemetry or analytics in v1.0
- All project data stays local (browser) or on user's server
- No cloud sync without explicit opt-in
- AI copilot: user chooses their own API key — no data routed through OpenClo servers
