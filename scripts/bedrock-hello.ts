// One-off check: a single real call to Claude on Bedrock from your laptop (lesson 19, Step 3).
// Not part of the Lambda package. Run with:
//   $env:AWS_PROFILE="dev"; npx tsx --env-file=.env.local scripts/bedrock-hello.ts
import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';

const region = process.env.AWS_REGION;
const model = process.env.BEDROCK_CHAT_MODEL_ID;
if (!region || !model) {
  throw new Error('Set AWS_REGION and BEDROCK_CHAT_MODEL_ID in .env.local');
}

const client = new AnthropicBedrockMantle({ awsRegion: region }); // credentials from AWS_PROFILE

async function main() {
  const res = await client.messages.create({
    model: model!,
    max_tokens: 1000,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
  });

  console.log('stop_reason:', res.stop_reason);
  console.log('content:', JSON.stringify(res.content));
  console.log('usage:', res.usage);
}

// No top-level await: package.json has no "type": "module", so tsx compiles this file as CommonJS.
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
