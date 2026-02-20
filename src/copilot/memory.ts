/**
 * Per-project Memory — persists conversation history and agent decisions per project.
 *
 * Stored in localStorage with key `openclo_memory_${projectId}`.
 * Max 50 messages (FIFO) with older messages summarized.
 *
 * @module memory
 */

/**
 * A single message in the conversation history.
 */
export interface MemoryMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** Tool names that were called (for assistant messages) */
  toolsCalled?: string[];
}

/**
 * Per-project memory data structure.
 */
export interface ProjectMemoryData {
  projectId: string;
  messages: MemoryMessage[];
  /** Key decisions made during the project */
  decisions: string[];
  /** Summary of older messages that were trimmed */
  summary: string;
  /** Last updated timestamp */
  updatedAt: number;
}

const MAX_MESSAGES = 50;
const STORAGE_PREFIX = 'openclo_memory_';

/**
 * Per-project memory manager.
 *
 * Handles saving, loading, and trimming conversation history
 * with per-project isolation in localStorage.
 *
 * @example
 * ```ts
 * const memory = new ProjectMemory('project-123');
 * memory.addMessage({ role: 'user', content: 'Create a bodice', timestamp: Date.now() });
 * memory.save();
 * ```
 */
export class ProjectMemory {
  private data: ProjectMemoryData;

  /**
   * Create a new ProjectMemory instance.
   * Automatically loads existing data from localStorage.
   *
   * @param projectId - Unique project identifier
   */
  constructor(projectId: string) {
    this.data = this.load(projectId);
  }

  /** Get the project ID */
  get projectId(): string {
    return this.data.projectId;
  }

  /** Get all messages */
  get messages(): MemoryMessage[] {
    return this.data.messages;
  }

  /** Get decisions */
  get decisions(): string[] {
    return this.data.decisions;
  }

  /** Get the summary of older trimmed messages */
  get summary(): string {
    return this.data.summary;
  }

  /**
   * Add a message to the conversation history.
   * If the history exceeds MAX_MESSAGES, older messages are trimmed
   * and a summary is generated.
   *
   * @param message - The message to add
   */
  addMessage(message: MemoryMessage): void {
    this.data.messages.push(message);
    this.data.updatedAt = Date.now();

    // Trim if exceeding max
    if (this.data.messages.length > MAX_MESSAGES) {
      this.trim();
    }
  }

  /**
   * Add a decision to the project memory.
   *
   * @param decision - Description of the decision
   */
  addDecision(decision: string): void {
    this.data.decisions.push(decision);
    // Keep last 20 decisions
    if (this.data.decisions.length > 20) {
      this.data.decisions = this.data.decisions.slice(-20);
    }
    this.data.updatedAt = Date.now();
  }

  /**
   * Get recent messages (last N).
   *
   * @param count - Number of recent messages to return (default 20)
   * @returns Array of recent messages
   */
  getRecent(count: number = 20): MemoryMessage[] {
    return this.data.messages.slice(-count);
  }

  /**
   * Clear all messages and decisions.
   */
  clear(): void {
    this.data.messages = [];
    this.data.decisions = [];
    this.data.summary = '';
    this.data.updatedAt = Date.now();
  }

  /**
   * Save current state to localStorage.
   */
  save(): void {
    try {
      const key = STORAGE_PREFIX + this.data.projectId;
      localStorage.setItem(key, JSON.stringify(this.data));
    } catch {
      // Silently fail (quota exceeded, etc.)
    }
  }

  /**
   * Delete this project's memory from localStorage.
   */
  delete(): void {
    try {
      localStorage.removeItem(STORAGE_PREFIX + this.data.projectId);
    } catch {
      // ignore
    }
  }

  /**
   * Get the full memory data (for serialization into agent context).
   */
  toJSON(): ProjectMemoryData {
    return { ...this.data };
  }

  /**
   * Build a context string for the agent system prompt.
   * Includes summary of previous conversations and recent decisions.
   *
   * @returns Context string for the LLM
   */
  toContextString(): string {
    const parts: string[] = [];

    if (this.data.summary) {
      parts.push(`Previous conversation summary: ${this.data.summary}`);
    }

    if (this.data.decisions.length > 0) {
      parts.push(`Decisions made:\n${this.data.decisions.map(d => `- ${d}`).join('\n')}`);
    }

    return parts.join('\n\n');
  }

  // ─── Private ──────────────────────────────────────────────────────────

  /**
   * Load memory from localStorage.
   */
  private load(projectId: string): ProjectMemoryData {
    try {
      const key = STORAGE_PREFIX + projectId;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as ProjectMemoryData;
        // Validate structure
        if (parsed.projectId === projectId && Array.isArray(parsed.messages)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    return {
      projectId,
      messages: [],
      decisions: [],
      summary: '',
      updatedAt: Date.now(),
    };
  }

  /**
   * Trim messages to MAX_MESSAGES, generating a summary of removed messages.
   */
  private trim(): void {
    const excess = this.data.messages.length - MAX_MESSAGES;
    if (excess <= 0) return;

    const removed = this.data.messages.splice(0, excess);

    // Generate a simple summary from removed messages
    const userMessages = removed
      .filter(m => m.role === 'user')
      .map(m => m.content.slice(0, 100));

    const assistantActions = removed
      .filter(m => m.role === 'assistant' && m.toolsCalled && m.toolsCalled.length > 0)
      .flatMap(m => m.toolsCalled || []);

    const summaryParts: string[] = [];
    if (userMessages.length > 0) {
      summaryParts.push(`User asked about: ${userMessages.join('; ')}`);
    }
    if (assistantActions.length > 0) {
      const uniqueActions = [...new Set(assistantActions)];
      summaryParts.push(`Tools used: ${uniqueActions.join(', ')}`);
    }

    const newSummary = summaryParts.join('. ');
    this.data.summary = this.data.summary
      ? `${this.data.summary}. ${newSummary}`
      : newSummary;

    // Keep summary under 500 chars
    if (this.data.summary.length > 500) {
      this.data.summary = this.data.summary.slice(-500);
    }
  }
}

/**
 * List all project IDs that have saved memory.
 *
 * @returns Array of project IDs
 */
export function listProjectMemories(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        ids.push(key.slice(STORAGE_PREFIX.length));
      }
    }
  } catch {
    // ignore
  }
  return ids;
}
