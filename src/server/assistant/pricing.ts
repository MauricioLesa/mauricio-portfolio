import 'server-only';
import type { AgentUsage } from './agent';

// Versioned price table (contracts: estimateCostUsd). USD per million tokens.
// Check against the Anthropic pricing page when the model or prices change, and bump the version.
export const PRICING_VERSION = '2026-11-23';

const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function estimateCostUsd(model: string, usage: AgentUsage): number {
  const p = PRICES[model];
  // Unknown model: price it high on purpose, so the spend cap trips early rather than late.
  if (!p) return ((usage.inputTokens + usage.outputTokens) * 15) / 1e6;
  return (
    (usage.inputTokens * p.input +
      usage.outputTokens * p.output +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite) /
    1e6
  );
}
