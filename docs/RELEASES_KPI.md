# OpenClo Release KPIs — Strategic Metrics

This document defines the Key Performance Indicators (KPIs) to measure the success and professional readiness of OpenClo as we move towards v1.0.

---

## 1. Core Engine & Physics (Performance)
*Focus: Stability and speed of the deterministic WASM solver.*

| KPI | Metric | Target (v0.7) | Target (v1.0) |
|-----|--------|---------------|---------------|
| **Simulation FPS** | Frames per second during 3D draping | Constant 60 FPS | Constant 60 FPS (Multi-layer) |
| **Reactive Latency** | 2D parameter change → 3D visual update | < 200ms | < 100ms (Instant Drape) |
| **Solver Robustness** | % of sessions without mesh "explosions" (NaN) | 98% | 99.9% |
| **Meshing Speed** | CDT triangulation time for standard piece | < 50ms | < 25ms |

## 2. AI Copilot (Intelligence & Agency)
*Focus: Accuracy of the Situated Agent and Semantic Graph manipulation.*

| KPI | Metric | Target (v0.7) | Target (v1.0) |
|-----|--------|---------------|---------------|
| **Action Accuracy** | % of AI edits resulting in sewable geometry | 85% | 95% |
| **Semantic Recall** | Correct identification of imported landmarks | 90% | 98% |
| **Instruction Success** | Multi-step request execution (1-turn) | 75% | 90% |
| **Memory Persistence** | Successful application of user preferences | 80% | 95% |

## 3. Product & UX (Workflow Efficiency)
*Focus: Competitive parity with industry standards (CLO3D/Gerber).*

| KPI | Metric | Target (v0.7) | Target (v1.0) |
|-----|--------|---------------|---------------|
| **Onboarding Time** | Time to first successful 3D drape (New User) | < 15 mins | < 5 mins |
| **Drafting Speed** | Time to create standard bodice vs. Benchmark | -20% vs v0.5 | Parity with CLO3D |
| **Shortcut Adoption** | % of actions performed via Keybinds/Palette | > 40% | > 70% |
| **UI Responsiveness** | Input latency for 2D drafting tools | < 16ms | < 8ms |

## 4. Ecosystem & Interop (Market Readiness)
*Focus: Growth and industrial integration.*

| KPI | Metric | Target (v0.8) | Target (v1.0) |
|-----|--------|---------------|---------------|
| **DXF Fidelity** | Round-trip data loss (Export -> Import) | < 1% | 0% |
| **Plugin Count** | Community-contributed Skills/Plugins | 10+ | 50+ |
| **Library Depth** | Verified base templates in Registry | 20+ | 100+ |
| **Marketplace Health** | Weekly Skill downloads/installs | - | Steady Growth |

---

## Monitoring Strategy
- **Telemetry**: (Optional) Anonymous performance tracking of WASM cycles and AI success rates.
- **E2E Testing**: Automated visual regression and geometric validation in CI/CD.
- **User Research**: Monthly "Fashion Engineering" sessions with patronistas (Maria/Adidas profile) to validate drafting speed and UX polish.
