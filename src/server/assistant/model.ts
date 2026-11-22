import 'server-only';
import type { Message, MessageParam, Tool } from '@anthropic-ai/sdk/resources/messages';

// The seam between the agent loop and any LLM provider (plan.md, "Assistant design").
// The Bedrock implementation (T074) streams each call and reports text through `onText`; the
// scripted fake (fakeModel.ts) lets the loop be tested in CI with no AWS calls and no cost.

export type { Message, MessageParam, Tool };

export interface ChatModelParams {
  system: string;
  tools: Tool[];
  messages: MessageParam[];
  max_tokens: number;
}

export interface ChatModelOptions {
  /** Called with each text delta as the model writes it (the route turns these into SSE). */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface ChatModel {
  /** One model call. Resolves with the complete message, so the loop stays a plain `await` per round. */
  create(params: ChatModelParams, options?: ChatModelOptions): Promise<Message>;
}
