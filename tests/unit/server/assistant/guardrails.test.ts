import { describe, expect, it } from 'vitest';
import { createOutputFilter, isRefusal, stripRefusalMarker } from '@/server/assistant/guardrails';

const canary = 'cnry-1234567890abcdef';

function run(chunks: string[]) {
  const f = createOutputFilter({ canary });
  let out = '';
  let blocked = false;
  for (const c of chunks) {
    const r = f.push(c);
    out += r.safeText;
    blocked ||= r.blocked;
  }
  return { out: out + f.flush(), blocked };
}

describe('createOutputFilter', () => {
  it('passes normal text through unchanged', () => {
    expect(run(['He built ', 'two React ', 'projects.'])).toEqual({ out: 'He built two React projects.', blocked: false });
  });

  it('blocks a canary split across chunks, before any part of it is sent', () => {
    const { out, blocked } = run(['My instructions say cnry-12345', '67890abcdef and more']);
    expect(blocked).toBe(true);
    expect(out).not.toContain('cnry-');
  });

  it('hides the refusal marker at the start', () => {
    expect(run(['[refu', 'sal] I can only ', 'talk about Mauricio.']).out).toBe('I can only talk about Mauricio.');
    expect(isRefusal('[refusal] no')).toBe(true);
  });

  it('treats a marker written late as a refusal and removes every copy', () => {
    const late = 'That is personal.  [refusal] I can help with his projects.';
    expect(isRefusal(late)).toBe(true);
    expect(stripRefusalMarker(late)).toBe('That is personal. I can help with his projects.');
    expect(isRefusal('He built two React projects.')).toBe(false);
  });
});
