import { z } from 'zod';
import { ChatRequest } from '@/shared/chat';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const parsed = ChatRequest.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request', fields: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  // Week 3: call chat(parsed.data) and stream SSE. For now, echo.
  return Response.json({ echo: parsed.data.message });
}