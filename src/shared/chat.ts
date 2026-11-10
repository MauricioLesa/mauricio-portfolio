import { z } from 'zod';

export const ChatRequest = z.object({
  message: z.string().trim().min(1, 'Message is empty').max(1000, 'Message is too long'),
  conversationId: z.uuid().optional(),
});

export type ChatRequest = z.infer<typeof ChatRequest>;