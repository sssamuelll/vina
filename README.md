# OpenClo

Open source 3D garment design tool. 2D pattern editor + 3D cloth simulation in the browser.

Think CLO3D, but free and open.

## Status

🚧 Early development — not usable yet.

## Architecture

- **2D Pattern Editor** — draw, edit, and connect garment pieces (SVG-based, React)
- **3D Viewport** — real-time cloth simulation over parametric avatars (Three.js + WebGL)
- **Sync** — edit in 2D, see it in 3D. Move in 3D, update the pattern.

## Stack

- React + TypeScript + Vite
- Redux Toolkit (state)
- Three.js / React Three Fiber (3D)
- SVG overlay (2D pattern tools)

## Run locally

```bash
npm install
npm run dev
```

## License

MIT
