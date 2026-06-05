/**
 * presentToUser Meta-Tool — the agent's "speak to the user" channel.
 *
 * The agentic loop's natural exit condition used to be "LLM emits text with
 * no tool calls". Under provider modes that allow empty `toolCalls` arrays
 * (e.g. Claude Code's `--json-schema` structured output, observed
 * 2026-05-28), the LLM exploits this to fabricate state without calling
 * the real action tools. Forcing the schema to require at least one tool
 * call closes that escape route, but then the LLM needs a legitimate
 * "I'm done / I want to wait for the user" tool to invoke.
 *
 * That tool is this one. Calling `presentToUser({ message, awaiting })`:
 *   - emits the message to the user (becomes the final response content)
 *   - signals the loop to exit and yield control back to the user
 *   - records whether the agent is awaiting a confirmation (UI hint)
 *
 * Read-only. Does not touch garment state. The loop intercepts this call
 * specially — see AgenticLoop.runInner.
 *
 * @module presentToUser
 */

import type { MetaToolDefinition, MetaToolResult } from './types';

/** The fixed name the AgenticLoop recognises as an exit signal. */
export const PRESENT_TO_USER_TOOL_NAME = 'presentToUser';

export const presentToUserTool: MetaToolDefinition = {
  name: PRESENT_TO_USER_TOOL_NAME,
  description:
    'Speak to the user and pause the loop. Call this in exactly two situations: (1) `awaiting: "confirmation"` when you have proposed a plan and need the user to approve before acting — message describes the proposal; OR (2) `awaiting: "done"` when ALL the action tools needed to fulfil the user\'s last request have ALREADY been called and ALREADY returned successfully in this conversation — message summarises what those tools did using their REAL return values. ' +
    'Do NOT call presentToUser({awaiting: "done"}) if any action tool the request requires has not yet been called. Doing so is fabrication: the message would describe state changes that never happened. For dressing intents specifically: the flow ends by ARRANGING (arrangeGarment + the confident seams over the user\'s imported pieces) and asking the user to verify and press Simulate — so use awaiting: "confirmation", not "done" (the agent never simulates). If no pieces are loaded, ask the user to import their DXF (you cannot load files). ' +
    'The loop exits the instant this tool is called — any other tool calls in the same response are dropped. Use this instead of returning empty toolCalls. / Hablar con el usuario y pausar el loop.',
  parameters: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The text the user will see. Match the user\'s language. Concise — one or two sentences typically. / El texto que verá el usuario.',
      },
      awaiting: {
        type: 'string',
        enum: ['confirmation', 'done'],
        description: '"confirmation" if you are proposing a plan and need the user to approve before you act; "done" if the requested work is complete and the loop should yield naturally. / Estado del agente al pausar.',
      },
    },
    required: ['message', 'awaiting'],
  },
  execute: async (params): Promise<MetaToolResult> => {
    // The loop catches this call BEFORE executing it (see AgenticLoop.runInner),
    // so this body is rarely reached in practice. It exists as a safety net for
    // any code path that exercises the meta-tool registry directly.
    return {
      success: true,
      data: {
        message: String(params.message ?? ''),
        awaiting: String(params.awaiting ?? 'done'),
      },
    };
  },
};
