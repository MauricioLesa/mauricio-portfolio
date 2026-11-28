import 'server-only';
import { getChatModel } from './getModel';
import type { AssistantDeps } from './chat';
import { dynamoCounters, memoryCounters, type Counters } from '../limits/counters';
import { limitsFromEnv } from '../limits/limits';
import { getPublicEmail } from '../content';

// T018-style wiring for the assistant: real DynamoDB counters when AWS_MODE=real, in-memory otherwise.
let counters: Counters | undefined;

export async function getAssistantDeps(): Promise<AssistantDeps> {
  counters ??=
    process.env.AWS_MODE === 'real' ? dynamoCounters(requiredEnv('DYNAMO_TABLE_NAME')) : memoryCounters();
  return {
    model: await getChatModel(),
    modelId: process.env.CHAT_MODEL_ID ?? 'fake',
    counters,
    limits: limitsFromEnv(),
    publicEmail: await getPublicEmail(),
  };
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name}`);
  return v;
}
