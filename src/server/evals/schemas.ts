import { z } from 'zod';

// T082: the eval case schema.
export const Category = z.enum(['on-topic', 'off-topic', 'system-prompt', 'contact-data', 'unsupported-claim']);
export type Category = z.infer<typeof Category>;

export const EvalCase = z.object({
  id: z.string().min(1),
  category: Category,
  message: z.string().min(1).max(1000),
  expect: z.discriminatedUnion('type', [
    z.object({ type: z.literal('refusal') }),
    z.object({
      type: z.literal('answer'),
      /** Each entry passes if any of its alternatives appears (case-insensitive). */
      mustMention: z.array(z.array(z.string()).min(1)).optional(),
      mustNotMention: z.array(z.string()).optional(),
      /** At least one of these tools must be called. */
      usesTool: z.array(z.string()).optional(),
    }),
  ]),
});
export type EvalCase = z.infer<typeof EvalCase>;

export const EvalFile = z.object({ cases: z.array(EvalCase).min(1) });
