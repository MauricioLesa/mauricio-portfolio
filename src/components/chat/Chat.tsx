'use client';

import { useRef, useState } from 'react';
import { askAssistant, type ChatEvent } from './sseClient';

type Step = Extract<ChatEvent, { type: 'step' }>;
type Done = Extract<ChatEvent, { type: 'done' }>;
interface Turn {
  question: string;
  answer: string;
  steps: Step[];
  done?: Done;
  error?: string;
}

const EXAMPLES = ['What has Mauricio built with React?', 'What is his AWS experience?', 'How can I contact him?'];

// T078, first version: one question at a time, the answer streams in, and "How I answered"
// shows the tool calls, tokens, cost and latency for each answer (T079).
export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const update = (fn: (t: Turn) => Turn) => setTurns((all) => [...all.slice(0, -1), fn(all[all.length - 1]!)]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    setBusy(true);
    setTurns((all) => [...all, { question: q, answer: '', steps: [] }]);
    abort.current = new AbortController();
    try {
      await askAssistant(
        q,
        (e) => {
          if (e.type === 'delta') update((t) => ({ ...t, answer: t.answer + e.text }));
          else if (e.type === 'step') update((t) => ({ ...t, steps: [...t.steps, e] }));
          else if (e.type === 'done') update((t) => ({ ...t, answer: e.answer, done: e }));
          else if (e.type === 'error') update((t) => ({ ...t, error: e.message }));
        },
        abort.current.signal,
      );
    } catch {
      update((t) => ({ ...t, error: 'The connection was lost. Please try again.' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-6" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i} className="flex flex-col gap-2">
            <p className="font-semibold">You: {t.question}</p>
            <div className="whitespace-pre-wrap rounded border border-border p-3">
              {t.error ?? (t.answer || (busy && i === turns.length - 1 ? 'Thinking…' : ''))}
            </div>
            {t.done && (
              <details className="text-sm">
                <summary className="cursor-pointer">How I answered</summary>
                <ul className="mt-2 list-disc pl-6">
                  {t.steps.map((s, j) => (
                    <li key={j}>
                      Round {s.round}: <code>{s.tool}</code>({JSON.stringify(s.input)}) {s.isError ? 'failed' : 'ok'}
                    </li>
                  ))}
                  <li>
                    {t.done.trace.rounds} tool rounds, {t.done.trace.modelCalls} model calls, model {t.done.trace.model}
                  </li>
                  <li>
                    {t.done.trace.usage.inputTokens} input and {t.done.trace.usage.outputTokens} output tokens, $
                    {t.done.trace.costUsd.toFixed(6)}
                  </li>
                  <li>
                    {t.done.trace.latencyMs.total} ms total ({t.done.trace.latencyMs.model} ms model, {t.done.trace.latencyMs.tools} ms tools)
                  </li>
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>

      {turns.length === 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Example questions">
          {EXAMPLES.map((q) => (
            <li key={q}>
              <button type="button" className="rounded border border-border px-3 py-1" onClick={() => send(q)}>
                {q}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <input
          id="chat-input"
          className="flex-1 rounded border border-border px-3 py-2"
          value={input}
          maxLength={1000}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Mauricio's projects, skills or experience"
          disabled={busy}
        />
        <button type="submit" className="rounded border border-border px-4 py-2 font-semibold" disabled={busy || !input.trim()}>
          Ask
        </button>
      </form>
    </div>
  );
}
