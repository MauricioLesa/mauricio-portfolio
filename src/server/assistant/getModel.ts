import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { AnthropicChatModel } from './anthropicModel';
import { FakeChatModel, fakeMessage, text } from './fakeModel';
import type { ChatModel } from './model';

// The provider switch: "the interface made the provider a config choice".
//   CHAT_PROVIDER=anthropic  key from ANTHROPIC_API_KEY (local) or SSM SecureString (Lambda)
//   CHAT_PROVIDER=fake       a canned answer, no network, no cost (default for dev and CI)
// Bedrock (T074) plugs in here as a third case once AWS Support lifts the account block.

let cached: Promise<ChatModel> | undefined;

export function getChatModel(): Promise<ChatModel> {
  cached ??= build();
  return cached;
}

async function build(): Promise<ChatModel> {
  const provider = process.env.CHAT_PROVIDER ?? 'fake';
  switch (provider) {
    case 'anthropic': {
      const model = required('CHAT_MODEL_ID');
      const effort = required('CHAT_EFFORT');
      if (effort !== 'low' && effort !== 'medium' && effort !== 'high') throw new Error('CHAT_EFFORT must be low, medium or high');
      const apiKey = process.env.ANTHROPIC_API_KEY ?? (await keyFromSsm(required('ANTHROPIC_KEY_PARAM')));
      return new AnthropicChatModel(new Anthropic({ apiKey, maxRetries: 1 }), model, effort);
    }
    case 'fake':
      return new FakeChatModel(
        Array.from({ length: 1000 }, () =>
          fakeMessage([text('This is the offline demo model. The live assistant uses Claude Haiku.')], 'end_turn'),
        ),
      );
    default:
      throw new Error(`Unknown CHAT_PROVIDER: ${provider}`);
  }
}

/** Read once per Lambda container, then kept in memory. Decrypted with the account's default KMS key. */
async function keyFromSsm(name: string): Promise<string> {
  const out = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = out.Parameter?.Value;
  if (!value) throw new Error(`SSM parameter ${name} is empty`);
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}
