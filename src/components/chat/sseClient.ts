// T077: POST a question and parse the event stream into typed events.
// CloudFront signs requests to the Lambda function URL with OAC, and for a POST the body's
// SHA-256 must be sent as x-amz-content-sha256, or the function URL rejects the signature.

export type ChatEvent =
  | { type: 'meta'; turnId: string }
  | { type: 'step'; round: number; tool: string; input: unknown; isError: boolean }
  | { type: 'delta'; text: string }
  | {
      type: 'done';
      outcome: 'answered' | 'refused' | 'blocked' | 'incomplete';
      answer: string;
      trace: {
        model: string;
        rounds: number;
        modelCalls: number;
        usage: { inputTokens: number; outputTokens: number };
        costUsd: number;
        latencyMs: { total: number; model: number; tools: number };
      };
    }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function askAssistant(message: string, onEvent: (e: ChatEvent) => void, signal?: AbortSignal): Promise<void> {
  const body = JSON.stringify({ message });
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-amz-content-sha256': await sha256Hex(body) },
    body,
    signal,
  });

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    onEvent({ type: 'error', code: data.code ?? `http_${res.status}`, message: data.message ?? 'Something went wrong.', retryable: res.status >= 500 });
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const frame = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = frame.split('\n').find((line) => line.startsWith('data: '));
      if (data) onEvent(JSON.parse(data.slice(6)) as ChatEvent);
    }
  }
}
