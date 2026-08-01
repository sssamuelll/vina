# Copilot Spec: Durable Design Memory & Context Compaction

## 1. Overview
Inspired by the **OpenClaw** architecture, this system moves the Copilot from a transient message-based history to a persistent, human-readable **Markdown Design Log**. It prevents "AI amnesia" during long design sessions by flushing durable facts to permanent storage before compacting the context window.

## 2. Storage Architecture: The "Design Log"
We will maintain a virtual file system inside IndexedDB that simulates a file at `.vina/project-log.md`.

### Log Structure
- **Durable Facts (`MEMORY.md` style)**: Long-term preferences (e.g., "User prefers 12mm seam allowance for denim").
- **Design Decisions**: Chronological log of technical changes (e.g., "2026-02-27: Widened back piece by 5mm to accommodate shoulder measurements").
- **Compacted Context**: Summaries of old conversations that have been pruned to save tokens.

## 3. The "Memory Flush" Protocol
To ensure information is never lost during pruning, the system must perform a **Flush** before compaction.

### The Trigger
When the `agentLoop` detects that the message history exceeds **4,000 tokens** (or 20 messages), a silent agent turn is triggered.

### The Turn
1. **Extraction**: The LLM is prompted: *"Review the following conversation. Identify any durable design decisions, technical constraints, or user preferences that should be remembered long-term."*
2. **Commit**: The LLM uses the `write_log_entry` tool to append these facts to the Design Log.
3. **Validation**: A pure function verifies the entry is valid Markdown.

## 4. Context Compaction Strategy
Once the Flush is complete, the older history is replaced by a single **Compaction Block**.

- **Pruned Messages**: Messages 1-15 are removed.
- **Compaction Block**: A message of type `system` is inserted: *"Context Compacted: Previous discussion summarized in Project Log. Key themes: [Summary List]."*
- **Retention**: Only the last 5 messages are kept in high-fidelity.

## 5. Technical Requirements for Implementation

### Data Interfaces
```typescript
interface DurableFact {
  id: string;
  category: 'preference' | 'decision' | 'constraint';
  content: string;
  timestamp: number;
  sourceMessageId?: string;
}

interface ProjectLog {
  facts: DurableFact[];
  lastCompaction: number;
  summary: string;
}
```

### Required Tool Additions
- `write_log_entry(content: string, category: string)`: Appends to the virtual Markdown file.
- `read_project_log()`: Returns the full content of the log for context injection.

## 6. Security & Integrity Guardrails
- **Human Editability**: The log should be viewable in a UI panel so the user can delete "hallucinated" memories.
- **No Overwrite**: The log is append-only by default to preserve history.
- **Token Efficiency**: The `read_project_log` tool should support pagination or "last N entries" to avoid re-filling the context window with the log itself.
