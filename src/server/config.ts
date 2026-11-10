import 'server-only';
import { z } from 'zod';

const Env = z.object({
  DEMO_SECRET: z.string().min(1),
});

let cached: z.infer<typeof Env> | undefined;

export function getConfig() {
  cached ??= Env.parse(process.env);
  return cached;
}