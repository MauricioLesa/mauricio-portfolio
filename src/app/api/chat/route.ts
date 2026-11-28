import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ChatRequest } from '@/shared/chat';
import { chat } from '@/server/assistant/chat';
import { getAssistantDeps } from '@/server/assistant/deps';

// T076: POST /api/chat. Validates, applies the limits, then streams ChatEvents as SSE.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ code: 'invalid_request', message: 'Body must be JSON' }, { status: 400 });
  }

  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { code: 'invalid_request', message: 'Invalid request', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const result = await chat({ message: parsed.data.message, visitorHash: visitorHash(req) }, await getAssistantDeps());
  if (!result.ok) {
    const status = result.reason === 'rate_limited' ? 429 : 503;
    const message =
      result.reason === 'rate_limited'
        ? 'Too many questions for now. Please try again later.'
        : 'The assistant is resting for today. The CV and Projects pages have the details.';
    return Response.json(
      { code: result.reason, message, retryAfterSeconds: result.retryAfterSeconds },
      { status, headers: result.retryAfterSeconds ? { 'Retry-After': String(result.retryAfterSeconds) } : {} },
    );
  }

  const encoder = new TextEncoder();
  const events = result.events;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** A daily-rotating hash of the viewer's IP: enough to rate-limit, never stored as an IP. */
function visitorHash(req: Request): string {
  const ip =
    // "ip:port", and IPv6 addresses contain colons too, so cut at the last one.
    req.headers.get('cloudfront-viewer-address')?.replace(/:\d+$/, '') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown';
  const salt = `${new Date().toISOString().slice(0, 10)}:${process.env.DEMO_SECRET ?? ''}`;
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}
