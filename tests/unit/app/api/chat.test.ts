// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/chat/route';

function req(body: unknown) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/chat', () => {
  it('accepts a valid message', async () => {
    const res = await POST(req({ message: 'What did you build at your last job?' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ echo: 'What did you build at your last job?' });
  });

  it('rejects an empty or whitespace-only message', async () => {
    const res = await POST(req({ message: '   ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.fields.message).toBeDefined();
  });

  it('rejects a message over 1000 characters', async () => {
    const res = await POST(req({ message: 'a'.repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not JSON instead of crashing', async () => {
    const res = await POST(req('not json'));
    expect(res.status).toBe(400);
  });
});