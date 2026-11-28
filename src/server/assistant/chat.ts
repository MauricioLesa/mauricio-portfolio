import 'server-only';
import { randomUUID } from 'node:crypto';
import { runAgent, type AgentResult, type AgentStep } from './agent';
import { BLOCKED_REPLACEMENT_TEXT, createOutputFilter, isRefusal, stripRefusalMarker } from './guardrails';
import type { ChatModel } from './model';
import { estimateCostUsd, PRICING_VERSION } from './pricing';
import { CANARY, systemPrompt } from './prompt';
import { checkLimits, recordSpend, type Limits } from '../limits/limits';
import type { Counters } from '../limits/counters';

// T075, the first live version: limits → prompt → runAgent with the output filter → spend.
// Not yet here (next steps): stored conversations (T072) and traces in DynamoDB (T073).

export type ChatEvent =
  | { type: 'meta'; turnId: string }
  | { type: 'step'; round: number; tool: string; input: unknown; isError: boolean }
  | { type: 'delta'; text: string }
  | { type: 'done'; outcome: 'answered' | 'refused' | 'blocked' | 'incomplete'; answer: string; trace: TurnTrace }
  | { type: 'error'; code: 'provider_error'; message: string; retryable: boolean };

export interface TurnTrace {
  turnId: string;
  model: string;
  steps: AgentStep[];
  rounds: number;
  modelCalls: number;
  usage: AgentResult['usage'];
  costUsd: number;
  pricingVersion: string;
  latencyMs: { total: number; model: number; tools: number };
}

export type ChatResult =
  | { ok: true; events: AsyncIterable<ChatEvent> }
  | { ok: false; reason: 'rate_limited' | 'assistant_unavailable'; retryAfterSeconds?: number };

export interface AssistantDeps {
  model: ChatModel;
  modelId: string;
  counters: Counters;
  limits: Limits;
  /** Mauricio's public email, put in the system prompt. Optional so tests can leave it out. */
  publicEmail?: string;
  now?: () => Date;
  log?: (msg: string, data: Record<string, unknown>) => void;
}

export async function chat(input: { message: string; visitorHash: string }, deps: AssistantDeps): Promise<ChatResult> {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((msg, data) => console.log(JSON.stringify({ msg, ...data })));

  const limit = await checkLimits(deps.counters, deps.limits, input.visitorHash, now());
  if (!limit.ok) {
    log('chat.blocked', { reason: limit.reason }); // no question text in logs
    return {
      ok: false,
      reason: limit.reason === 'rate_limited' ? 'rate_limited' : 'assistant_unavailable',
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  return { ok: true, events: stream(input.message, deps, now, log) };
}

async function* stream(
  question: string,
  deps: AssistantDeps,
  now: () => Date,
  log: (msg: string, data: Record<string, unknown>) => void,
): AsyncGenerator<ChatEvent> {
  const turnId = randomUUID();
  const started = performance.now();
  const queue: ChatEvent[] = [];
  let wake: (() => void) | undefined;
  const emit = (e: ChatEvent) => {
    queue.push(e);
    wake?.();
  };

  yield { type: 'meta', turnId };

  const filter = createOutputFilter({ canary: CANARY });
  let blocked = false;
  const run = runAgent({ system: systemPrompt(deps.publicEmail), question }, deps.model, {
    onEvent: (e) => {
      if (e.type === 'step') {
        emit({ type: 'step', round: e.round, tool: e.tool, input: e.input, isError: e.isError });
        return;
      }
      const { safeText, blocked: b } = filter.push(e.text);
      blocked ||= b;
      if (safeText) emit({ type: 'delta', text: safeText });
    },
  }).then(
    (result) => ({ result }),
    (error: unknown) => ({ error }),
  );

  let settled: Awaited<typeof run> | undefined;
  void run.then((s) => {
    settled = s;
    wake?.();
  });

  for (;;) {
    while (queue.length) yield queue.shift()!;
    if (settled) break;
    await new Promise<void>((resolve) => (wake = resolve));
    wake = undefined;
  }

  if ('error' in settled) {
    log('chat.error', { turnId, error: String(settled.error) });
    yield { type: 'error', code: 'provider_error', message: 'The assistant is unavailable right now. Please try again in a minute.', retryable: true };
    return;
  }

  const { result } = settled;
  const costUsd = estimateCostUsd(deps.modelId, result.usage);
  await recordSpend(deps.counters, costUsd, now());

  let outcome: 'answered' | 'refused' | 'blocked' | 'incomplete' = result.outcome;
  let answer = stripRefusalMarker(result.answer);
  if (blocked || result.answer.includes(CANARY)) {
    outcome = 'blocked';
    answer = BLOCKED_REPLACEMENT_TEXT;
  } else {
    const rest = filter.flush();
    if (rest) yield { type: 'delta', text: rest };
    if (outcome === 'answered' && isRefusal(result.answer)) outcome = 'refused';
  }

  const trace: TurnTrace = {
    turnId,
    model: deps.modelId,
    steps: result.steps,
    rounds: result.rounds,
    modelCalls: result.modelCalls,
    usage: result.usage,
    costUsd,
    pricingVersion: PRICING_VERSION,
    latencyMs: { total: Math.round(performance.now() - started), ...result.latencyMs },
  };
  log('chat.turn', { turnId, outcome, rounds: trace.rounds, modelCalls: trace.modelCalls, costUsd, usage: trace.usage, latencyMs: trace.latencyMs });
  yield { type: 'done', outcome, answer, trace };
}
