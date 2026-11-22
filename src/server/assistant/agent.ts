import 'server-only';
import type { MessageParam, ToolResultBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';
import type { ChatModel, Message } from './model';
import { runTool as defaultRunTool, TOOL_DEFS, type ToolResult } from './tools';

// T067: the tool-use loop (spec FR-011, FR-012, FR-040; plan.md "Assistant design").
// It knows nothing about HTTP or SSE: it reports progress through `onEvent`, and the route turns
// those events into SSE. That keeps it testable with a scripted model and an array of events.

export const MAX_TOOL_ROUNDS = 4;
export const MAX_TOKENS = 1024;

export const REFUSAL_ANSWER =
  "I can't help with that. I can answer questions about Mauricio's projects, skills, experience and how to contact him.";
export const INCOMPLETE_ANSWER =
  "I couldn't finish answering that within my limits. You'll find the details on the CV and Projects pages.";
export const SHORTENED_SUFFIX = ' (answer shortened)';

export type AgentOutcome = 'answered' | 'refused' | 'incomplete';

export interface AgentStep {
  round: number;
  tool: string;
  input: unknown;
  isError: boolean;
  latencyMs: number;
}

export type AgentEvent = ({ type: 'step' } & AgentStep) | { type: 'delta'; text: string };

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AgentResult {
  outcome: AgentOutcome;
  answer: string;
  steps: AgentStep[];
  /** Tool rounds run (0–MAX_TOOL_ROUNDS). */
  rounds: number;
  modelCalls: number;
  usage: AgentUsage;
  /** The answer hit max_tokens. */
  truncated: boolean;
  latencyMs: { model: number; tools: number };
}

export interface RunAgentInput {
  system: string;
  /** Earlier turns of the conversation, as text (FR-013). */
  history?: MessageParam[];
  question: string;
}

export interface RunAgentOptions {
  maxRounds?: number;
  maxTokens?: number;
  /** Called with a `step` after each tool runs and a `delta` for each text chunk, as they happen. */
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
  /** Injected for tests; defaults to the real read-only tools. */
  runTool?: (name: string, input: unknown) => Promise<ToolResult>;
  now?: () => number;
}

/**
 * Runs the tool-use loop until the model gives a final answer, refuses, or hits a limit.
 * Rejects only if the model call itself fails (network, timeout); `chat()` turns that into an
 * `error` event. A failing tool never rejects: it goes back to the model as `is_error: true`.
 */
export async function runAgent(input: RunAgentInput, model: ChatModel, options: RunAgentOptions = {}): Promise<AgentResult> {
  const {
    maxRounds = MAX_TOOL_ROUNDS,
    maxTokens = MAX_TOKENS,
    onEvent,
    signal,
    runTool = defaultRunTool,
    now = () => performance.now(),
  } = options;

  const messages: MessageParam[] = [...(input.history ?? []), { role: 'user', content: input.question }];
  const steps: AgentStep[] = [];
  const usage: AgentUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let rounds = 0;
  let modelCalls = 0;
  let modelMs = 0;
  let toolsMs = 0;

  const finish = (outcome: AgentOutcome, answer: string, truncated = false): AgentResult => ({
    outcome,
    answer,
    steps,
    rounds,
    modelCalls,
    usage,
    truncated,
    latencyMs: { model: Math.round(modelMs), tools: Math.round(toolsMs) },
  });

  for (;;) {
    const callStarted = now();
    const response = await model.create(
      { system: input.system, tools: [...TOOL_DEFS], messages, max_tokens: maxTokens },
      { signal, onText: (text) => onEvent?.({ type: 'delta', text }) },
    );
    modelMs += now() - callStarted;
    modelCalls++;
    addUsage(usage, response);

    const answer = textOf(response);
    const toolCalls = response.content.filter((block): block is ToolUseBlock => block.type === 'tool_use');

    // Check stop_reason before reading the content.
    switch (response.stop_reason) {
      case 'end_turn':
      case 'stop_sequence':
        return finish('answered', answer);
      case 'refusal':
        return finish('refused', REFUSAL_ANSWER);
      case 'max_tokens':
        // Cut off while writing the answer: keep it, marked. Cut off mid tool call: nothing usable.
        return toolCalls.length === 0 && answer
          ? finish('answered', answer + SHORTENED_SUFFIX, true)
          : finish('incomplete', INCOMPLETE_ANSWER, true);
      case 'tool_use':
        break;
      default:
        // pause_turn, model_context_window_exceeded, null: not expected with three small tools.
        return finish('incomplete', INCOMPLETE_ANSWER);
    }

    if (rounds >= maxRounds) return finish('incomplete', INCOMPLETE_ANSWER); // FR-040
    rounds++;
    const round = rounds;

    // 1. The assistant's content goes back unchanged (text, tool_use and any thinking blocks).
    messages.push({ role: 'assistant', content: response.content });

    // 2. Run every requested tool in parallel; report each step as soon as it finishes.
    const toolsStarted = now();
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const started = now();
        const result = await runTool(call.name, call.input);
        const step: AgentStep = {
          round,
          tool: call.name,
          input: call.input,
          isError: result.isError,
          latencyMs: Math.round(now() - started),
        };
        onEvent?.({ type: 'step', ...step });
        return { call, result, step };
      }),
    );
    toolsMs += now() - toolsStarted;
    steps.push(...results.map((r) => r.step)); // in the order the model asked, not finish order

    // 3. One user message answering every tool_use, matched by id.
    const toolResults: ToolResultBlockParam[] = results.map(({ call, result }) => ({
      type: 'tool_result',
      tool_use_id: call.id,
      content: result.content,
      is_error: result.isError,
    }));
    messages.push({ role: 'user', content: toolResults });
  }
}

function textOf(message: Message): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

function addUsage(total: AgentUsage, message: Message): void {
  total.inputTokens += message.usage.input_tokens;
  total.outputTokens += message.usage.output_tokens;
  total.cacheReadTokens += message.usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += message.usage.cache_creation_input_tokens ?? 0;
}
