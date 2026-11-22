import { describe, expect, it } from 'vitest';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import {
  INCOMPLETE_ANSWER,
  REFUSAL_ANSWER,
  runAgent,
  SHORTENED_SUFFIX,
  type AgentEvent,
} from '@/server/assistant/agent';
import { FakeChatModel, fakeMessage, text, thinking, toolUse } from '@/server/assistant/fakeModel';

// T067: the tool-use loop, tested with a scripted model and the real read-only tools over content/.
const SYSTEM = 'You answer questions about Mauricio using only the tools.';
const ask = (question: string) => ({ system: SYSTEM, question });

/** The tool_result blocks of a user message. */
function toolResultsOf(message: MessageParam | undefined) {
  expect(message?.role).toBe('user');
  return message!.content as { type: string; tool_use_id: string; content: string; is_error: boolean }[];
}

describe('runAgent', () => {
  it('runs one tool round, then returns the final answer', async () => {
    const first = fakeMessage([text('Let me check.'), toolUse('toolu_1', 'list_projects', { tech: 'React' })], 'tool_use');
    const model = new FakeChatModel([first, fakeMessage([text('He built two React projects.')], 'end_turn')]);

    const result = await runAgent(ask('What has he built with React?'), model);

    expect(result).toMatchObject({ outcome: 'answered', answer: 'He built two React projects.', rounds: 1, modelCalls: 2 });
    expect(result.steps).toEqual([expect.objectContaining({ round: 1, tool: 'list_projects', isError: false })]);
    expect(model.requests[0]!.tools.map((t) => t.name)).toEqual(['list_projects', 'get_project', 'get_profile']);

    // The second request: question, assistant content unchanged, then the matching tool_result.
    const [question, assistant, results] = model.requests[1]!.messages;
    expect(question).toEqual({ role: 'user', content: 'What has he built with React?' });
    expect(assistant).toEqual({ role: 'assistant', content: first.content });
    const [result1] = toolResultsOf(results);
    expect(result1).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1', is_error: false });
    expect(JSON.parse(result1!.content)).toHaveLength(2);
  });

  it('runs two tools from one reply and answers both in ONE user message, in order', async () => {
    const model = new FakeChatModel([
      fakeMessage(
        [toolUse('toolu_a', 'get_profile', { section: 'skills' }), toolUse('toolu_b', 'list_projects', {})],
        'tool_use',
      ),
      fakeMessage([text('Done.')], 'end_turn'),
    ]);

    const result = await runAgent(ask('Skills and projects?'), model);

    const messages = model.requests[1]!.messages;
    expect(messages).toHaveLength(3); // question, assistant, one user message with both results
    expect(toolResultsOf(messages[2]).map((r) => r.tool_use_id)).toEqual(['toolu_a', 'toolu_b']);
    expect(result.steps.map((s) => s.tool)).toEqual(['get_profile', 'list_projects']);
    expect(result.rounds).toBe(1);
  });

  it('sends a tool error back with is_error and keeps going', async () => {
    const model = new FakeChatModel([
      fakeMessage([toolUse('toolu_1', 'get_project', { slug: 'no-such-project' })], 'tool_use'),
      fakeMessage([text('I have no record of that project.')], 'end_turn'),
    ]);

    const result = await runAgent(ask('Tell me about no-such-project'), model);

    const [errorResult] = toolResultsOf(model.requests[1]!.messages[2]);
    expect(errorResult).toMatchObject({ tool_use_id: 'toolu_1', is_error: true });
    expect(errorResult!.content).toMatch(/list_projects/);
    expect(result).toMatchObject({ outcome: 'answered', answer: 'I have no record of that project.' });
    expect(result.steps[0]!.isError).toBe(true);
  });

  it('stops after 4 tool rounds with a fixed answer (FR-040)', async () => {
    const asksForever = Array.from({ length: 5 }, (_, i) =>
      fakeMessage([toolUse(`toolu_${i}`, 'list_projects', {})], 'tool_use'),
    );
    const model = new FakeChatModel(asksForever); // a 6th call would throw "no scripted reply"

    const result = await runAgent(ask('Loop forever'), model);

    expect(result).toMatchObject({ outcome: 'incomplete', answer: INCOMPLETE_ANSWER, rounds: 4, modelCalls: 5 });
    expect(result.steps).toHaveLength(4);
  });

  it('still allows a final answer right after the 4th round', async () => {
    const replies = [
      ...Array.from({ length: 4 }, (_, i) => fakeMessage([toolUse(`toolu_${i}`, 'list_projects', {})], 'tool_use')),
      fakeMessage([text('Final answer.')], 'end_turn'),
    ];
    const result = await runAgent(ask('Four lookups'), new FakeChatModel(replies));
    expect(result).toMatchObject({ outcome: 'answered', answer: 'Final answer.', rounds: 4 });
  });

  it('returns the polite refusal without running tools', async () => {
    const model = new FakeChatModel([fakeMessage([], 'refusal')]);
    const result = await runAgent(ask('Something unsafe'), model);
    expect(result).toMatchObject({ outcome: 'refused', answer: REFUSAL_ANSWER, steps: [], rounds: 0 });
  });

  it('keeps a final answer cut off by max_tokens, marked as shortened', async () => {
    const model = new FakeChatModel([fakeMessage([text('He built a migration that')], 'max_tokens')]);
    const result = await runAgent(ask('Long answer please'), model);
    expect(result).toMatchObject({ outcome: 'answered', truncated: true });
    expect(result.answer).toBe(`He built a migration that${SHORTENED_SUFFIX}`);
  });

  it('gives up without running tools when max_tokens cuts off a tool call', async () => {
    const model = new FakeChatModel([fakeMessage([toolUse('toolu_1', 'get_project', {})], 'max_tokens')]);
    const result = await runAgent(ask('Cut off'), model);
    expect(result).toMatchObject({ outcome: 'incomplete', answer: INCOMPLETE_ANSWER, truncated: true, steps: [] });
  });

  it('sends thinking blocks back unchanged', async () => {
    const first = fakeMessage([thinking('Need the project list.'), toolUse('toolu_1', 'list_projects', {})], 'tool_use');
    const model = new FakeChatModel([first, fakeMessage([text('Ok.')], 'end_turn')]);
    await runAgent(ask('Projects?'), model);
    expect(model.requests[1]!.messages[1]).toEqual({ role: 'assistant', content: first.content });
  });

  it('reports delta and step events as they happen, in order', async () => {
    const model = new FakeChatModel([
      fakeMessage([text('Let me check.'), toolUse('toolu_1', 'list_projects', {})], 'tool_use'),
      fakeMessage([text('Three projects.')], 'end_turn'),
    ]);
    const events: AgentEvent[] = [];

    await runAgent(ask('Projects?'), model, { onEvent: (e) => events.push(e) });

    // The fake streams text a word at a time: 'Let ', 'me ', 'check.' then 'Three ', 'projects.'.
    expect(events.map((e) => e.type)).toEqual(['delta', 'delta', 'delta', 'step', 'delta', 'delta']);
    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text);
    expect(deltas.join('')).toBe('Let me check.Three projects.');
  });

  it('sums usage over all model calls and sends the history first', async () => {
    const history: MessageParam[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello! Ask me about Mauricio.' },
    ];
    const model = new FakeChatModel([
      fakeMessage([toolUse('toolu_1', 'get_profile', { section: 'contact' })], 'tool_use', { input_tokens: 300, output_tokens: 40 }),
      fakeMessage([text('Email him.')], 'end_turn', { input_tokens: 500, output_tokens: 10 }),
    ]);

    const result = await runAgent({ system: SYSTEM, history, question: 'How do I contact him?' }, model);

    expect(model.requests[0]!.messages.slice(0, 2)).toEqual(history);
    expect(result.usage).toEqual({ inputTokens: 800, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });

  it('rejects when the model call fails, so chat() can send a provider error', async () => {
    const failing = { create: () => Promise.reject(new Error('connection reset')) };
    await expect(runAgent(ask('Hi'), failing)).rejects.toThrow('connection reset');
  });
});
