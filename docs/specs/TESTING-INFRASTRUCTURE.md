# Engineering Spec: Testing Infrastructure & QA Guardrails (v0.7)

## 1. Overview
The goal of this infrastructure is to ensure zero TypeScript errors in the `main` branch and maintain a high level of confidence in the simulation and copilot systems. We move from reactive fixing to **proactive prevention** through multi-layer validation.

## 2. Current State (v0.7)

| Metric | Value |
|--------|-------|
| Test files | 186 |
| Source files | 461 |
| Total LOC | ~127,000 |
| Tool definitions | 45 |
| Test framework | Vitest |
| E2E framework | Playwright |

## 3. Layer 1: Local Prevention (Git Hooks)
To prevent developers from committing broken code, we will implement **Husky + lint-staged**.

### Pre-commit Protocol:
1. **Linting**: Run `eslint` on staged files.
2. **Type Check**: Run `npx tsc -p tsconfig.app.json --noEmit` on the whole project.
3. **Unit Tests**: Run Vitest on affected files.

**Guardrail**: Any failure in these steps will block the `git commit` command.

## 4. Layer 2: Integration Integrity
We must validate that modules work together, especially the Copilot-Store-Sim-Worker bridge.

### Requirements:
- **`src/copilot/__tests__/`**: Must contain tests that use real Redux actions and state shapes.
- **Worker Protocol Validation**: Any change to `WorkerInMessage` or `WorkerOutMessage` must be mirrored in a dedicated integration test to prevent simulation freezes.
- **Linked Editing Tests**: The `linkedEditingMiddleware` must have tests covering both instance and symmetry propagation modes.
- **Edge-Name Seam Tests**: Verify that seam references using `pieceId:edgeName` format resolve correctly across the entire stack.

## 5. Layer 3: CI/CD Enforcement (GitHub Actions)
The CI pipeline is the final gatekeeper.

### Automated Checks on PR/Push:
- **Build Validation**: `npm run build` must pass before any merge.
- **Coverage Thresholds**: Fail the build if global coverage drops below **60%**.
- **Smoke Tests**: Run Playwright simulation tests (Gravity Smoke Test) to ensure garments are visible.

## 6. Test Coverage Strategy
We will use **Vitest + V8** for coverage reporting.

### Target Coverage by Module:
| Module | Target | Why? |
| :--- | :--- | :--- |
| `src/utils/cloth/` | 80% | High-risk physics logic |
| `src/copilot/` | 75% | Complex reasoning & tool execution |
| `src/store/` | 90% | State management is the source of truth |
| `src/tools/` | 70% | Tool definitions and handlers |
| `src/utils/dxf/` | 80% | File format parsing is critical |
| `src/components/` | 40% | Focus on business logic, not just UI layout |

## 7. Documentation & Maintenance
- **`CHANGELOG.md`**: Must record all QA infrastructure updates.
- **Badges**: Test coverage badge displayed in `README.md`.
- **Manual QA**: Feature branches must be manually verified in the deployed staging environment before merging to `main`.
