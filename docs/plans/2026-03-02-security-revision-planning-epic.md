# Epic: Production-Ready Security Revision & Planning

## 📌 Overview
This Epic tracks the systematic audit, planning, and design phase for **OpenClo.ai Production-Ready Security**. Based on the [Security Architecture Spec](../specs/SECURITY.md), we must move from the current "Development-First" approach to a "Security-by-Design" professional standard.

**Goal**: Prepare the codebase for the implementation of the Deterministic Firewall, Encrypted Vault, and AI Prompt Guarding.

---

## 🔍 Phase 1: Security Audit (Revision)
*Audit the current codebase against known vulnerabilities and identifying implementation gaps.*

- [ ] **Audit Copilot Execution Layer**: Identify all entry points where LLM-generated JSON is applied to the Redux store (`src/copilot/toolExecutor.ts` and `commandExecutor.ts`).
- [ ] **Audit Prompt Assembly**: Review the `EnhancedContextBuilder` and `agentLoop.ts` to identify where user input can leak outside intended XML tags.
- [ ] **Audit Credential Flow**: Map all components using `localStorage` for API Keys and identify the best points for intercepting them for the Encrypted Vault.
- [ ] **Server Path Resolution Audit**: Formally list all routes in `server/api.ts` that use `path.join` with user-provided IDs.
- [ ] **Dependency Audit**: Scan `package.json` for insecure versions of parsers (DXF, Seamly2D) that could be vulnerable to ReDoS or Prototype Pollution.

## 📐 Phase 2: Design & Specification (Planning)
*Define the exact technical contracts for the implementation team.*

- [ ] **Design `CopilotCommand` Zod Schema**: Create the strict type definitions that will act as the "Deterministic Firewall."
- [ ] **Design Encrypted Vault Interface**: Define the `VaultAPI` (encrypt, decrypt, rotate) using the browser's Web Crypto API.
- [ ] **Design .oskill Sandbox Protocol**: Define the message-passing interface between the Main Thread and the Isolated Skill Worker.
- [ ] **Plan VFS (Virtual File System) Layer**: Design the middleware for Node.js to sanitize and jail all file operations to the project directory.
- [ ] **Refine "Silent Ingestion" Guardrails**: Define the geometric validation limits (min/max area, max vertices) to prevent memory exhaustion attacks during file import.

## 🎯 Acceptance Criteria for this Epic
1. A complete list of vulnerable code locations is identified.
2. Technical specifications (Schemas and Interfaces) are ready for the implementation team (Super Opus).
3. The "Implementation Checklist" for the next phase is finalized.

## 🔗 References
- [Security Architecture Spec](../specs/SECURITY.md)
- [Copilot Brain Spec](../specs/AI-COPILOT.md)
