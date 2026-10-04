/**
 * AgenticLoop — unified tool-use loop for the copilot.
 *
 * Replaces the plan-then-execute architecture (AgenticPlanner + ExecutionBridge +
 * Reasoner + EnhancedReasoner + ResultStore + SummaryGenerator) with a single
 * agentic loop where the LLM calls tools iteratively until the work is done.
 *
 * The LLM has access to both:
 * - Meta-tools (read-only): getGarmentState, getPieceDetails, measureEdge, searchPieces
 * - Action tools (mutations): modifyEdge, createPiece, addDart, etc.
 *
 * The loop terminates when the LLM responds with text (no tool calls).
 *
 * @module bridge/AgenticLoop
 */

import type {
  ChatMessage,
  ProviderToolDef,
  ProviderResponse,
  ProviderToolCall,
} from '../../providers/types';
import type { MetaToolDefinition } from './meta-tools/types';
import type { ToolRegistry } from '../../action/tools/registry';
import type { AppDispatch, RootState } from '../../../store';
import { buildDomainBootstrap } from './domainBootstrap';
import { PRESENT_TO_USER_TOOL_NAME } from './meta-tools/presentToUser';
import { getKnowledgeStore } from '../../knowledge/KnowledgeStore';
import type { KnowledgeSearchResult } from '../../knowledge/types';
import {
  pushToolExecution,
  type ToolExecutionRecord,
} from '../../debug/toolExecutionTracker';

// ─── Event Types ─────────────────────────────────────────────────────────────

export type AgenticEvent =
  | { type: 'tool:start'; name: string; args: Record<string, unknown> }
  | { type: 'tool:complete'; name: string; result: unknown }
  | { type: 'tool:cancelled'; name: string; message: string }
  | { type: 'tool:error'; name: string; error: string }
  | { type: 'text:delta'; content: string }
  | { type: 'complete'; content: string }
  | { type: 'error'; error: string };

export type AgenticEventHandler = (event: AgenticEvent) => void;

// ─── Options ─────────────────────────────────────────────────────────────────

export interface AgenticLoopOptions {
  /** LLM send function */
  send: (
    messages: ChatMessage[],
    tools: ProviderToolDef[],
    config?: unknown,
  ) => Promise<ProviderResponse>;
  /** Read-only meta-tools */
  metaTools: MetaToolDefinition[];
  /** Action tool definitions (for LLM to see) */
  actionToolDefs: ProviderToolDef[];
  /** State accessor for meta-tool execution */
  getState: () => RootState;
  /** Redux dispatch for action tool execution */
  dispatch: AppDispatch;
  /** Action tool registry (for execution) */
  registry?: ToolRegistry;
  /** Provider config to pass through to send */
  providerConfig?: unknown;
}

// ─── Tool Call Record ────────────────────────────────────────────────────────

export interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

type ToolOutcome =
  | { kind: 'complete' }
  | { kind: 'cancelled'; message: string }
  | { kind: 'error'; error: string };

function classifyReturnedToolResult(name: string, result: unknown): ToolOutcome {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return { kind: 'complete' };
  }

  const value = result as {
    success?: unknown;
    error?: unknown;
    message?: unknown;
  };
  if (value.success !== false) return { kind: 'complete' };
  if (typeof value.error === 'string' && value.error.trim()) {
    return { kind: 'error', error: value.error };
  }
  if (typeof value.message === 'string' && value.message.trim()) {
    return { kind: 'cancelled', message: value.message };
  }
  return { kind: 'error', error: `Tool "${name}" returned success:false` };
}

function toRingRecord(
  toolName: string,
  args: Record<string, unknown>,
  outcome: ToolOutcome,
  timestamp: number,
  durationMs: number,
): ToolExecutionRecord {
  return {
    toolName,
    args,
    success: outcome.kind === 'complete'
      ? true
      : outcome.kind === 'error'
        ? false
        : null,
    error: outcome.kind === 'error' ? outcome.error : null,
    timestamp,
    durationMs,
  };
}

// ─── AgenticLoop ─────────────────────────────────────────────────────────────

/** Lo que queda en la conversación cuando María detiene al agente (spec 2026-10-02 § 6.2). */
export const RESPUESTA_DETENIDA = 'Detenida. Lo que alcanzó a hacer sigue en el patrón.';

export class AgenticLoop {
  private send: AgenticLoopOptions['send'];
  private metaTools: Map<string, MetaToolDefinition>;
  private actionToolDefs: ProviderToolDef[];
  private getState: () => RootState;
  private registry: ToolRegistry | undefined;
  private providerConfig: unknown;
  private lastToolCalls: ToolCallRecord[] = [];

  // Conversation history persists across run() calls so the LLM has context
  // for multi-turn flows — most importantly the convention-only confirmation
  // gate used by the M2 dressing intent (system prompt step 3 instructs the
  // LLM to propose + STOP, then continue on the next user message). Without
  // history, turn 2 would arrive at the LLM as "[system, 'sí, úsala']" with
  // no context for what was proposed. Stored without the system message so
  // a fresh system prompt (with refreshed knowledge retrieval) can be prepended
  // each turn.
  private conversationHistory: ChatMessage[] = [];

  /** «Detener»: el turno en curso no hace nada más. Lo mira `runInner`. */
  private detenido = false;

  constructor(options: AgenticLoopOptions) {
    this.send = options.send;
    this.metaTools = new Map(options.metaTools.map((t) => [t.name, t]));
    this.actionToolDefs = options.actionToolDefs;
    this.getState = options.getState;
    this.registry = options.registry;
    this.providerConfig = options.providerConfig;
  }

  /**
   * Get tool call records from the last run (for debugging).
   */
  getLastToolCalls(): ToolCallRecord[] {
    return [...this.lastToolCalls];
  }

  /**
   * Clear the conversation history. Call when the user starts a fresh
   * session (project switch, provider switch, "clear conversation"
   * action). The system message is not stored — it's rebuilt every run().
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * «Detener» (spec 2026-10-02 § 6.2). Es cooperativo: la respuesta que esté
   * en camino se descarta al llegar y no se ejecuta otra herramienta. Lo que
   * ya hizo se queda en el patrón.
   */
  detener(): void {
    this.detenido = true;
  }

  /**
   * Read-only view of the current conversation history (for debugging /
   * tests). Does NOT include the system message.
   */
  getConversationHistory(): readonly ChatMessage[] {
    return this.conversationHistory;
  }

  /**
   * Run the agentic loop with a user request.
   *
   * The LLM drives the loop: it calls tools (read + write) as needed,
   * and terminates naturally when it responds with text (no tool calls).
   */
  async run(userRequest: string, onEvent: AgenticEventHandler): Promise<string> {
    this.lastToolCalls = [];
    this.detenido = false;

    try {
      return await this.runInner(userRequest, onEvent);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      onEvent({ type: 'error', error: errorMsg });
      throw err;
    }
  }

  private async runInner(userRequest: string, onEvent: AgenticEventHandler): Promise<string> {
    // Retrieve relevant knowledge for this request
    const knowledge = await this.retrieveKnowledge(userRequest);
    const systemPrompt = this.buildSystemPrompt(knowledge);
    const allToolDefs = this.buildAllToolDefs();

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.conversationHistory,
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.send(messages, allToolDefs, this.providerConfig);
      if (this.detenido) return RESPUESTA_DETENIDA;

      // ── presentToUser early-exit ────────────────────────────────────────
      // Under provider modes that enforce `toolCalls.minItems: 1` (the M2
      // shim's structured-output schema, observed 2026-05-28), the LLM
      // cannot exit the loop by emitting empty toolCalls. Instead it
      // signals end-of-turn by calling presentToUser({message, awaiting}).
      // We intercept that call here BEFORE running it through the registry:
      //   - the `message` becomes the assistant's content
      //   - the loop exits
      //   - any other tool calls in the same response are ignored
      // This is the architectural fix for audit gap §3.3 (promote from
      // convention-only to a real exit-signalling tool).
      //
      // Gating: `presentToUser({awaiting: "done"})` is rejected unless at
      // least one action tool (not a meta-tool, not presentToUser itself)
      // has been called in this conversation. Without this gate, Sonnet
      // exploits the early-exit by calling presentToUser({awaiting: "done"})
      // with a fabricated success message — observed repeatedly in the M2
      // integration test runs. Rejection injects an error tool result and
      // continues the loop, giving the LLM a chance to call the real
      // action tools and try again. `awaiting: "confirmation"` does not
      // gate because the agent legitimately needs to pause before acting.
      const presentCall = response.toolCalls.find(
        (tc) => tc.name === PRESENT_TO_USER_TOOL_NAME,
      );
      if (presentCall) {
        let presentArgs: { message?: string; awaiting?: string } = {};
        try {
          presentArgs = JSON.parse(presentCall.arguments);
        } catch {
          // Malformed args — fall back to whatever content the LLM emitted
          presentArgs = { message: response.content };
        }

        const awaiting = presentArgs.awaiting;
        const isMetaName = (n: string): boolean =>
          n === PRESENT_TO_USER_TOOL_NAME || this.metaTools.has(n);

        // ── Grounding gate (applies to both confirmation and done) ──
        // The LLM cannot call presentToUser as its only act in an entire
        // conversation. There must be a non-presentToUser tool call
        // SOMEWHERE in the messages (current response, this run's prior
        // turns, or earlier conversation history). Without this, Sonnet
        // skips the read-the-catalog step and proposes a hallucinated
        // pattern in presentToUser({awaiting: "confirmation"}) directly.
        const otherCallsInResponse = response.toolCalls.some(
          (tc) => tc.name !== PRESENT_TO_USER_TOOL_NAME,
        );
        const callsInHistory = messages.some(
          (m) =>
            m.role === 'assistant' &&
            Array.isArray(m.tool_calls) &&
            m.tool_calls.some((tc) => tc.name !== PRESENT_TO_USER_TOOL_NAME),
        );
        const callsThisRun = this.lastToolCalls.some(
          (tc) => tc.name !== PRESENT_TO_USER_TOOL_NAME,
        );

        if (!otherCallsInResponse && !callsInHistory && !callsThisRun) {
          const errorMsg =
            'presentToUser was rejected. You cannot speak to the user without first grounding ' +
            'your response in at least one real tool call. The conversation has no tool calls yet, ' +
            'and your current response contains no tool calls other than presentToUser. ' +
            'You must call the relevant tools (e.g. getGarmentState to read the loaded pieces for a ' +
            'dressing intent) BEFORE you propose anything to the user. Whatever you would have ' +
            'said in the message is unsupported by real state — call the tools first, then propose.';

          const assistantMsg: ChatMessage = {
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.toolCalls,
          };
          if (response.reasoningContent) {
            assistantMsg.reasoning_content = response.reasoningContent;
          }
          messages.push(assistantMsg);
          messages.push({
            role: 'tool',
            content: JSON.stringify({ success: false, error: errorMsg }),
            tool_call_id: presentCall.id,
          });
          this.lastToolCalls.push({
            name: PRESENT_TO_USER_TOOL_NAME,
            arguments: presentArgs as Record<string, unknown>,
            result: { success: false, error: errorMsg },
            duration: 0,
            isMetaTool: true,
          });
          pushToolExecution(toRingRecord(
            PRESENT_TO_USER_TOOL_NAME,
            presentArgs as Record<string, unknown>,
            { kind: 'error', error: errorMsg },
            Date.now(),
            0,
          ));
          onEvent({ type: 'tool:start', name: PRESENT_TO_USER_TOOL_NAME, args: presentArgs as Record<string, unknown> });
          onEvent({ type: 'tool:error', name: PRESENT_TO_USER_TOOL_NAME, error: errorMsg });
          continue;
        }

        // Done-gating: require at least one action tool call BETWEEN the
        // most recent presentToUser({awaiting: "confirmation"}) and the
        // current presentToUser({awaiting: "done"}) call. This enforces
        // the slice semantic propose → confirm → ACT → done. Without this
        // temporal gate, the LLM exploits prior action tool calls from
        // earlier in the conversation (e.g. getGarmentState from
        // turn 1) as evidence that "work was done" — even though the
        // user-facing post-confirmation work has not actually run.
        // If no prior confirmation exists, fall back to a simpler "any
        // action tool ever called" check (covers single-turn requests
        // that don't go through a confirmation gate).
        if (awaiting === 'done') {
          // Scan assistant messages back-to-front for the most recent
          // presentToUser(awaiting: "confirmation") call.
          let lastConfirmIdx = -1;
          for (let i = messages.length - 1; i >= 0; i--) {
            const m = messages[i];
            if (m.role !== 'assistant' || !m.tool_calls) continue;
            const confirmCall = m.tool_calls.find((tc) => {
              if (tc.name !== PRESENT_TO_USER_TOOL_NAME) return false;
              try {
                const args = JSON.parse(tc.arguments) as { awaiting?: string };
                return args.awaiting === 'confirmation';
              } catch {
                return false;
              }
            });
            if (confirmCall) {
              lastConfirmIdx = i;
              break;
            }
          }

          // Count action tools either since lastConfirmIdx (if found) or
          // anywhere in history (if no prior confirmation).
          const searchStart = lastConfirmIdx >= 0 ? lastConfirmIdx + 1 : 0;
          const actionsInScope = messages.slice(searchStart).some(
            (m) =>
              m.role === 'assistant' &&
              Array.isArray(m.tool_calls) &&
              m.tool_calls.some((tc) => !isMetaName(tc.name)),
          );
          // Also include this-run tool calls that have already executed
          // (lastToolCalls is reset per run() but may contain action tools
          // from THIS run before presentToUser was emitted).
          const actionsThisRun = this.lastToolCalls.some(
            (tc) => !tc.isMetaTool && tc.name !== PRESENT_TO_USER_TOOL_NAME,
          );

          if (!actionsInScope && !actionsThisRun) {
            const errorMsg = lastConfirmIdx >= 0
              ? 'presentToUser({awaiting: "done"}) was rejected. The user confirmed your previous proposal, but you have not yet called any action tool to actually execute that proposal. The Redux store has not changed since the confirmation. Call the action tools the user just approved (e.g. arrangeGarment, createSeam for a dressing flow) and then try presentToUser again with REAL numbers from the tool results — never fabricated.'
              : 'presentToUser({awaiting: "done"}) was rejected. No action tool has been called in this conversation. Call the relevant action tools required by the user\'s request first, then try presentToUser again.';

            // Record the rejected attempt in messages so the LLM sees its
            // own output + the rejection on the next turn.
            const assistantMsg: ChatMessage = {
              role: 'assistant',
              content: response.content || '',
              tool_calls: response.toolCalls,
            };
            if (response.reasoningContent) {
              assistantMsg.reasoning_content = response.reasoningContent;
            }
            messages.push(assistantMsg);
            messages.push({
              role: 'tool',
              content: JSON.stringify({ success: false, error: errorMsg }),
              tool_call_id: presentCall.id,
            });

            // Record + emit event for visibility
            this.lastToolCalls.push({
              name: PRESENT_TO_USER_TOOL_NAME,
              arguments: presentArgs as Record<string, unknown>,
              result: { success: false, error: errorMsg },
              duration: 0,
              isMetaTool: true,
            });
            pushToolExecution(toRingRecord(
              PRESENT_TO_USER_TOOL_NAME,
              presentArgs as Record<string, unknown>,
              { kind: 'error', error: errorMsg },
              Date.now(),
              0,
            ));
            onEvent({ type: 'tool:start', name: PRESENT_TO_USER_TOOL_NAME, args: presentArgs as Record<string, unknown> });
            onEvent({ type: 'tool:error', name: PRESENT_TO_USER_TOOL_NAME, error: errorMsg });

            // Continue the while loop — let the LLM try again with the
            // rejection context now in the message history.
            continue;
          }
        }

        const message = presentArgs.message ?? response.content ?? '';
        // Push the full assistant response (with tool_calls intact) followed
        // by a synthetic tool result for the presentToUser call. Preserving
        // tool_calls is what lets the next turn's done-gate find the most
        // recent presentToUser({awaiting: "confirmation"}) via the
        // lastConfirmIdx scan. Without this, the early-exit dropped the
        // tool_calls and the gate fell back to "any action tool ever
        // called" which Sonnet exploited.
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        };
        if (response.reasoningContent) {
          assistantMsg.reasoning_content = response.reasoningContent;
        }
        messages.push(assistantMsg);
        messages.push({
          role: 'tool',
          content: JSON.stringify({ success: true, data: presentArgs }),
          tool_call_id: presentCall.id,
        });
        this.conversationHistory = messages.slice(1);
        // Surface as a normal tool:start/complete pair so the UI animation
        // is consistent with any other tool call.
        const presentResult = { success: true, data: presentArgs };
        this.lastToolCalls.push({
          name: PRESENT_TO_USER_TOOL_NAME,
          arguments: presentArgs as Record<string, unknown>,
          result: presentResult,
          duration: 0,
          isMetaTool: true,
        });
        pushToolExecution(toRingRecord(
          PRESENT_TO_USER_TOOL_NAME,
          presentArgs as Record<string, unknown>,
          { kind: 'complete' },
          Date.now(),
          0,
        ));
        onEvent({ type: 'tool:start', name: PRESENT_TO_USER_TOOL_NAME, args: presentArgs as Record<string, unknown> });
        onEvent({ type: 'tool:complete', name: PRESENT_TO_USER_TOOL_NAME, result: presentResult });
        onEvent({ type: 'complete', content: message });
        return message;
      }

      // Text response with no tool calls = work is done. (Kept as a fallback
      // for providers that emit empty toolCalls naturally — the M2 shim
      // schema rejects it, but plain-text providers without forced-min may
      // still hit this path.)
      if (response.toolCalls.length === 0) {
        const finalAssistant: ChatMessage = { role: 'assistant', content: response.content };
        messages.push(finalAssistant);
        // Persist all messages from this run EXCEPT the system message — the
        // system message is rebuilt next run with potentially refreshed
        // knowledge chunks. Everything else (user input + assistant tool_calls
        // + tool results + final assistant text) carries over.
        this.conversationHistory = messages.slice(1);
        onEvent({ type: 'complete', content: response.content });
        return response.content;
      }

      // Build assistant message with all tool calls
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.toolCalls,
      };
      if (response.reasoningContent) {
        assistantMsg.reasoning_content = response.reasoningContent;
      }
      messages.push(assistantMsg);

      // Surface the agent's narration for THIS batch of tool calls so the UI
      // decision trail can show the WHY behind each action (auditability).
      // The loop is non-streaming, so this is the only emission of per-round
      // content; the final user-facing message arrives via presentToUser.
      if (response.content && response.content.trim()) {
        onEvent({ type: 'text:delta', content: response.content.trim() });
      }

      // Execute each tool call and append results
      for (const toolCall of response.toolCalls) {
        if (this.detenido) return RESPUESTA_DETENIDA;
        const timestamp = Date.now();
        const start = performance.now();
        let args: Record<string, unknown> = {};
        let parseError: string | undefined;

        try {
          args = this.parseArgs(toolCall);
        } catch (err) {
          parseError = err instanceof Error ? err.message : String(err);
        }

        let result: unknown;
        let isMetaTool = false;
        let forcedError: string | undefined;

        if (parseError) {
          result = { success: false, error: parseError };
          forcedError = parseError;
        } else {
          onEvent({ type: 'tool:start', name: toolCall.name, args });
          try {
            const metaTool = this.metaTools.get(toolCall.name);
            if (metaTool) {
              isMetaTool = true;
              result = await metaTool.execute(args, this.getState);
            } else if (this.registry) {
              result = await this.registry.execute(toolCall.name, args);
            } else {
              result = { success: false, error: `Unknown tool: ${toolCall.name}` };
            }
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            result = { success: false, error: errorMsg };
            forcedError = errorMsg;
          }
        }

        // Record BEFORE firing event so getLastToolCalls() is up-to-date
        const duration = performance.now() - start;
        const outcome: ToolOutcome = forcedError
          ? { kind: 'error', error: forcedError }
          : classifyReturnedToolResult(toolCall.name, result);
        this.lastToolCalls.push({
          name: toolCall.name,
          arguments: args,
          result,
          duration,
          isMetaTool,
        });
        pushToolExecution(toRingRecord(
          toolCall.name,
          args,
          outcome,
          timestamp,
          duration,
        ));

        if (outcome.kind === 'error') {
          onEvent({ type: 'tool:error', name: toolCall.name, error: outcome.error });
        } else if (outcome.kind === 'cancelled') {
          onEvent({
            type: 'tool:cancelled',
            name: toolCall.name,
            message: outcome.message,
          });
        } else {
          onEvent({ type: 'tool:complete', name: toolCall.name, result });
        }

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }

  /**
   * Parse arguments from a tool call, handling JSON parse errors gracefully.
   */
  private parseArgs(toolCall: ProviderToolCall): Record<string, unknown> {
    try {
      return JSON.parse(toolCall.arguments);
    } catch {
      const raw =
        toolCall.arguments.length > 200
          ? toolCall.arguments.slice(0, 200) + '…'
          : toolCall.arguments;
      throw new Error(
        `Malformed JSON in tool arguments for "${toolCall.name}". Raw: ${raw}`,
      );
    }
  }

  /**
   * Retrieve relevant knowledge chunks for the user's request.
   * Uses keyword search (v1) -- embedding search added when embeddings are computed.
   */
  private async retrieveKnowledge(userRequest: string): Promise<KnowledgeSearchResult[]> {
    try {
      const store = getKnowledgeStore();
      return await store.search(userRequest, undefined, 5);
    } catch {
      // Knowledge retrieval is optional — don't block the loop on failure
      return [];
    }
  }

  /**
   * Build the system prompt combining domain knowledge, retrieved knowledge,
   * and tool descriptions.
   */
  private buildSystemPrompt(knowledge: KnowledgeSearchResult[] = []): string {
    const domain = buildDomainBootstrap();

    // Build knowledge context from retrieved chunks
    let knowledgeSection = '';
    if (knowledge.length > 0) {
      const chunks = knowledge
        .map((r, i) => {
          const meta = r.chunk.metadata;
          const source = meta.sourceRef || meta.source;
          return `[${i + 1}] (${meta.category}, source: ${source})\n${r.chunk.content}`;
        })
        .join('\n\n');
      knowledgeSection = `\n\n## Reference Materials\nThe following pattern-making knowledge may be relevant to this request. Use it to inform your approach.\n\n${chunks}`;
    }

    const metaToolList = Array.from(this.metaTools.values())
      .map((t) => `- **${t.name}** (read-only): ${t.description}`)
      .join('\n');

    const actionToolList = this.actionToolDefs
      .map((t) => `- **${t.name}**: ${t.description}`)
      .join('\n');

    return `${domain}${knowledgeSection}

## Read-Only Tools (inspect garment state)
${metaToolList || 'None'}

## Action Tools (modify garment)
${actionToolList || 'None'}

## Instructions
- Use read-only tools first to understand current state before making changes.
- After making changes, verify the result if needed.
- Respond in the user's language when done.
- If a tool fails, investigate with read-only tools and retry with corrected parameters.`;
  }

  /**
   * Build all tool definitions (meta + action) for the LLM.
   */
  private buildAllToolDefs(): ProviderToolDef[] {
    const metaDefs = Array.from(this.metaTools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

    // Deduplicate: meta-tools first, action tools won't override
    const seen = new Set<string>();
    const all: ProviderToolDef[] = [];
    for (const def of [...metaDefs, ...this.actionToolDefs]) {
      if (!seen.has(def.name)) {
        seen.add(def.name);
        all.push(def);
      }
    }
    return all;
  }
}
