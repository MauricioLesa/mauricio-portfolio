import 'server-only';
import type {
  ContentBlock,
  Message,
  StopReason,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages';
import type { ChatModel, ChatModelOptions, ChatModelParams } from './model';

// T074 (fake part): a scripted ChatModel for tests. It returns the replies it was given, in order,
// sends their text to `onText` in small chunks like a real stream, and records every request so
// tests can check exactly what the loop sent.

export class FakeChatModel implements ChatModel {
  readonly requests: ChatModelParams[] = [];
  private calls = 0;

  constructor(private readonly replies: Message[]) {}

  async create(params: ChatModelParams, options?: ChatModelOptions): Promise<Message> {
    // Copy, because the loop keeps pushing to the same messages array after this call.
    this.requests.push(structuredClone(params));
    const reply = this.replies[this.calls++];
    if (!reply) throw new Error(`FakeChatModel: no scripted reply for call ${this.calls}`);
    for (const block of reply.content) {
      if (block.type === 'text') for (const chunk of chunks(block.text)) options?.onText?.(chunk);
    }
    return reply;
  }
}

let nextId = 0;

/** A complete Message with the fields a test doesn't care about filled in. */
export function fakeMessage(
  content: ContentBlock[],
  stop_reason: StopReason,
  usage: { input_tokens?: number; output_tokens?: number } = {},
): Message {
  return {
    id: `msg_fake_${++nextId}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    stop_details: null,
    container: null,
    diagnostics: null,
    usage: {
      input_tokens: usage.input_tokens ?? 100,
      output_tokens: usage.output_tokens ?? 20,
      cache_creation: null,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
  };
}

export function text(value: string): TextBlock {
  return { type: 'text', text: value, citations: null };
}

export function toolUse(id: string, name: string, input: unknown): ToolUseBlock {
  return { type: 'tool_use', id, name, input, caller: { type: 'direct' } };
}

export function thinking(value: string): ThinkingBlock {
  return { type: 'thinking', thinking: value, signature: 'sig_fake' };
}

/** Splits text into chunks of a few words, like stream deltas. */
function chunks(value: string): string[] {
  return value.match(/\S+\s*/g) ?? [];
}
