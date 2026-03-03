# Agentic Loop Design — Unified Tool-Use Loop for Copilot

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the plan-then-execute architecture with a single agentic loop where the LLM calls tools (read + write) iteratively until the work is done.

**Architecture:** One `AgenticLoop` class replaces `AgenticPlanner`, `ExecutionBridge`, `Reasoner`, `EnhancedReasoner`, `ResultStore`, and `SummaryGenerator`. The LLM drives the loop: it reads garment state via meta-tools, makes changes via action tools, observes results, and responds with text when done.

**Inspiration:** OpenClaw (openclaw/openclaw) — standard agentic pattern used by Claude Code, ChatGPT, and modern AI assistants.

---

## Current Architecture (being replaced)

```
User → AgenticPlanner (LLM + meta-tools) → ExecutionPlan JSON → ExecutionBridge.executePlan() → step-by-step → Summary
```

Problems:
- LLM can only read during planning, never sees execution results
- Plan is generated upfront — can't adapt based on what happens
- Separate Reasoner for error recovery adds complexity
- ExecutionPlan JSON format is fragile and verbose
- Variable resolution (`$stepId.result.field`) is brittle

## New Architecture

```
User → LLM (all tools: read + write) → tool calls → execute → results → LLM → ... → text response = done
```

### Core Loop

```typescript
class AgenticLoop {
  async run(userRequest: string, onEvent: AgenticEventHandler): Promise<string> {
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userRequest },
    ];

    while (true) {
      const response = await this.send(messages, allToolDefs, this.providerConfig);

      // Text response = work is done
      if (response.toolCalls.length === 0) {
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

      // Execute each tool call and append results
      for (const toolCall of response.toolCalls) {
        onEvent({ type: 'tool:start', name: toolCall.name, args: parseArgs(toolCall) });

        const result = await this.executeTool(toolCall);

        onEvent({ type: 'tool:complete', name: toolCall.name, result });

        messages.push({
          role: 'tool',
          content: JSON.stringify(result),
          tool_call_id: toolCall.id,
        });
      }
    }
  }
}
```

### Tool Execution

Both meta-tools and action tools are presented to the LLM identically as `ProviderToolDef[]`. Internally, execution routes differently:

- **Meta-tools** (read-only): `getGarmentState`, `getPieceDetails`, `measureEdge`, `searchPieces` — call `getState()` only
- **Action tools** (mutations): `modifyEdge`, `createPiece`, `addDart`, etc. — call `dispatch()` + `getState()`

```typescript
private async executeTool(toolCall: ProviderToolCall): Promise<unknown> {
  const args = JSON.parse(toolCall.arguments);

  // Meta-tool? Read-only execution
  const metaTool = this.metaTools.get(toolCall.name);
  if (metaTool) {
    return metaTool.execute(args, this.getState);
  }

  // Action tool? Execute via registry
  return this.registry.execute(toolCall.name, args);
}
```

### Events

Simpler event model — no plan/step hierarchy:

```typescript
type AgenticEvent =
  | { type: 'tool:start'; name: string; args: Record<string, unknown> }
  | { type: 'tool:complete'; name: string; result: unknown }
  | { type: 'tool:error'; name: string; error: string }
  | { type: 'text:delta'; content: string }
  | { type: 'complete'; content: string }
  | { type: 'error'; error: string }

type AgenticEventHandler = (event: AgenticEvent) => void;
```

### Error Recovery

No separate Reasoner. The LLM sees tool errors inline and recovers naturally:

```
assistant: [calls modifyEdge({ pieceId: "front-bodice", edge: "neckline", delta: -20 })]
tool:      { success: false, error: "Piece 'front-bodice' not found" }
assistant: [calls searchPieces({ query: "front bodice" })]
tool:      { success: true, matches: [{ pieceId: "front-1", pieceName: "Front Bodice" }] }
assistant: [calls modifyEdge({ pieceId: "front-1", edge: "neckline", delta: -20 })]
tool:      { success: true, data: { newLength: 125.3 } }
assistant: "Listo! Acorté el escote 2cm en el delantero. La nueva medida es 12.53cm."
```

### System Prompt

Combines domain bootstrap (garment vocabulary) with tool descriptions:

```typescript
private buildSystemPrompt(): string {
  const domain = buildDomainBootstrap();

  const metaToolList = this.metaToolDefs
    .map(t => `- **${t.name}** (read-only): ${t.description}`)
    .join('\n');

  const actionToolList = this.actionToolDefs
    .map(t => `- **${t.name}**: ${t.description}`)
    .join('\n');

  return `${domain}

## Read-Only Tools (inspect garment state)
${metaToolList}

## Action Tools (modify garment)
${actionToolList}

## Instructions
- Use read-only tools first to understand current state before making changes.
- After making changes, verify the result if needed.
- Respond in the user's language when done.
- If a tool fails, investigate with read-only tools and retry with corrected parameters.`;
}
```

## What Gets Deleted

| File | Reason |
|------|--------|
| `AgenticPlanner.ts` | Replaced by AgenticLoop |
| `ExecutionBridge.ts` | Replaced by AgenticLoop |
| `Reasoner.ts` | LLM handles errors naturally |
| `EnhancedReasoner.ts` | LLM handles errors naturally |
| `ResultStore.ts` | LLM sees results in context |
| `SummaryGenerator.ts` | LLM generates its own response |
| `Planner.ts` (parsePlan) | No more ExecutionPlan JSON |
| `types.ts` (ExecutionPlan, Step, etc.) | No more plan format |

## What Stays

| File | Notes |
|------|-------|
| Meta-tool types & implementations | Keep as-is |
| `domainBootstrap.ts` | Keep as-is |
| Action tool registry + definitions | Keep as-is |
| Debug suite | Adapt to log tool calls |
| `useBridge` hook | Refactor to use AgenticLoop |
| CopilotPanel UI | Adapt progress display |

## React Integration

`useBridge` becomes `useAgenticLoop`:

```typescript
function useAgenticLoop(options: AgenticLoopOptions): AgenticLoopReturn {
  const [toolCalls, setToolCalls] = useState<ToolCallProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const run = useCallback(async (request: string) => {
    setIsRunning(true);
    setToolCalls([]);
    setResponse(null);

    const loop = new AgenticLoop(options);
    const result = await loop.run(request, (event) => {
      switch (event.type) {
        case 'tool:start':
          setToolCalls(prev => [...prev, { name: event.name, status: 'running' }]);
          break;
        case 'tool:complete':
          setToolCalls(prev => prev.map(tc =>
            tc.name === event.name && tc.status === 'running'
              ? { ...tc, status: 'done' }
              : tc
          ));
          break;
        case 'complete':
          setResponse(event.content);
          break;
      }
    });

    setIsRunning(false);
    return result;
  }, [options]);

  return { toolCalls, isRunning, response, run };
}
```

## Debug Suite Adaptation

Replace plan-based recording with tool-call recording:

```typescript
interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
  duration: number;
  isMetaTool: boolean;
}

interface AgenticRecord {
  userRequest: string;
  toolCalls: ToolCallRecord[];
  finalResponse: string;
  totalDuration: number;
  success: boolean;
}
```
