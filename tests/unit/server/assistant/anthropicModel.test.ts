import { describe, expect, it, vi } from 'vitest';
import { AnthropicChatModel, type StreamingClient } from '@/server/assistant/anthropicModel';
import { fakeMessage, text } from '@/server/assistant/fakeModel';

// Option A: AnthropicChatModel passes text deltas through and returns the final message.
function stubClient(reply = fakeMessage([text('Hi.')], 'end_turn')) {
  const handlers: Record<string, (delta: string) => void> = {};
  const stream = vi.fn(() => ({
    on(event: string, fn: (delta: string) => void) {
      handlers[event] = fn;
      return this;
    },
    async finalMessage() {
      handlers.text?.('Hi');
      handlers.text?.('.');
      return reply;
    },
  }));
  return { client: { messages: { stream } } as unknown as StreamingClient, stream };
}

const params = { system: 'sys', tools: [], messages: [{ role: 'user' as const, content: 'hello' }], max_tokens: 1024 };

describe('AnthropicChatModel', () => {
  it('passes each text delta to onText and resolves with the final message', async () => {
    const reply = fakeMessage([text('Hi.')], 'end_turn');
    const { client } = stubClient(reply);
    const deltas: string[] = [];

    const result = await new AnthropicChatModel(client, 'm', 'low').create(params, { onText: (d) => deltas.push(d) });

    expect(deltas).toEqual(['Hi', '.']);
    expect(result).toBe(reply);
  });
});
