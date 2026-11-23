import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ChatModel, ChatModelOptions, ChatModelParams, Message } from './model';

// Option A (2026-11-23): the Anthropic API as a second provider behind ChatModel, while Bedrock is
// blocked for the account (Error 002). Streamed, thinking off, 15 s per call. The model and the
// effort come from config (getModel.ts), so only the owner changes them. agent.ts does not change.

export const CALL_TIMEOUT_MS = 15_000;

/** The one method this class uses, so tests can pass a stub instead of the real SDK client. */
export interface StreamingClient {
  messages: Pick<Anthropic['messages'], 'stream'>;
}

export class AnthropicChatModel implements ChatModel {
  constructor(
    private readonly client: StreamingClient,
    private readonly model: string,
    private readonly effort: 'low' | 'medium' | 'high',
  ) {}

  async create(params: ChatModelParams, options: ChatModelOptions = {}): Promise<Message> {
    // Abort on whichever comes first: the caller's signal or our 15 s timeout.
    const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    const stream = this.client.messages.stream(
      {
        model: this.model,
        max_tokens: params.max_tokens,
        thinking: { type: 'disabled' },
        output_config: { effort: this.effort },
        system: params.system,
        tools: params.tools,
        messages: params.messages,
      },
      { signal },
    );
    if (options.onText) stream.on('text', options.onText);
    return stream.finalMessage();
  }
}
