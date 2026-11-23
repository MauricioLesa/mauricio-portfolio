// One-off check: a single real call to Claude through the Anthropic API (option A, step 1).
// Not part of the Lambda package. Run with (PowerShell):
//   $env:ANTHROPIC_API_KEY = Read-Host "Anthropic key"
//   npx tsx scripts/anthropic-hello.ts
import Anthropic from '@anthropic-ai/sdk';

// The SDK reads ANTHROPIC_API_KEY from the environment by itself.
const client = new Anthropic();

async function main() {
  const res = await client.messages.create({
    model: 'claude-haiku-5-5',
    max_tokens: 200,
    messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
  });

  console.log('stop_reason:', res.stop_reason);
  console.log('content:', JSON.stringify(res.content));
  console.log('usage:', res.usage);
  // Haiku 5.5: $0.10 per million input tokens, $0.50 per million output tokens.
  const cost = (res.usage.input_tokens * 0.1 + res.usage.output_tokens * 0.5) / 1e6;
  console.log('cost (USD):', cost.toFixed(6));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
