// Prints only safe facts about the Anthropic settings (never the key), then makes one tiny call.
// Run: npx tsx --env-file-if-exists=.env.local scripts/check-anthropic-env.ts
import Anthropic from '@anthropic-ai/sdk';

const key = process.env.ANTHROPIC_API_KEY ?? '';
console.log({
  keySet: key.length > 0,
  keyPrefix: key.slice(0, 10),
  keyLength: key.length,
  keyHasSpaceOrNewline: /\s/.test(key),
  keyHasQuotes: /["']/.test(key),
  authTokenSet: !!process.env.ANTHROPIC_AUTH_TOKEN,
  baseUrl: process.env.ANTHROPIC_BASE_URL ?? '(default https://api.anthropic.com)',
  customHeadersSet: !!process.env.ANTHROPIC_CUSTOM_HEADERS,
});

new Anthropic({ apiKey: key.trim() })
  .messages.create({ model: process.env.CHAT_MODEL_ID ?? 'claude-haiku-5-5', max_tokens: 20, messages: [{ role: 'user', content: 'Say hi.' }] })
  .then((r) => console.log('OK:', r.stop_reason, r.usage))
  .catch((e) => console.log('FAILED:', String(e)));
