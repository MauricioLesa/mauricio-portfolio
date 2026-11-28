import 'server-only';
import type { Counters } from './counters';

// T071 (spend cap) and T060 (rate limit), the small version. Amounts are stored in micro-USD so
// the counters stay whole numbers.

export interface Limits {
  dailyUsd: number;
  monthlyUsd: number;
  chatPerHour: number;
}

/**
 * The caps come only from the environment (set at deploy time, not in the repo). With the real
 * provider a missing or invalid cap is an error, so the assistant never runs without a limit.
 * The fake provider (dev, CI) gets small placeholder caps.
 */
export function limitsFromEnv(env = process.env): Limits {
  const real = (env.CHAT_PROVIDER ?? 'fake') !== 'fake';
  const read = (name: string, fakeDefault: number) => {
    const raw = env[name];
    if (raw === undefined || raw === '') {
      if (real) throw new Error(`Set ${name}`);
      return fakeDefault;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a number >= 0`);
    return value;
  };
  return {
    dailyUsd: read('SPEND_CAP_DAILY_USD', 0.01),
    monthlyUsd: read('SPEND_CAP_MONTHLY_USD', 0.1),
    chatPerHour: read('RATE_LIMIT_CHAT_PER_HOUR', 20),
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const month = (d: Date) => d.toISOString().slice(0, 7);
const hour = (d: Date) => d.toISOString().slice(0, 13);
const secondsToNextHour = (d: Date) => 3600 - (d.getUTCMinutes() * 60 + d.getUTCSeconds());
const secondsToNextDay = (d: Date) => 86400 - (d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds());

export type LimitCheck = { ok: true } | { ok: false; reason: 'rate_limited' | 'daily_cap' | 'monthly_cap'; retryAfterSeconds: number };

/** Counts this request against the visitor's hourly limit, then checks the spend caps. */
export async function checkLimits(counters: Counters, limits: Limits, visitorHash: string, now: Date): Promise<LimitCheck> {
  const count = await counters.add(`RATE#${visitorHash}`, hour(now), 1, 2 * 3600);
  if (count > limits.chatPerHour) return { ok: false, reason: 'rate_limited', retryAfterSeconds: secondsToNextHour(now) };

  const [spentDay, spentMonth] = await Promise.all([
    counters.get('SPEND#DAY', day(now)),
    counters.get('SPEND#MONTH', month(now)),
  ]);
  if (spentMonth >= limits.monthlyUsd * 1e6) return { ok: false, reason: 'monthly_cap', retryAfterSeconds: secondsToNextDay(now) };
  if (spentDay >= limits.dailyUsd * 1e6) return { ok: false, reason: 'daily_cap', retryAfterSeconds: secondsToNextDay(now) };
  return { ok: true };
}

export async function recordSpend(counters: Counters, costUsd: number, now: Date): Promise<void> {
  const micro = Math.ceil(costUsd * 1e6);
  await Promise.all([
    counters.add('SPEND#DAY', day(now), micro, 40 * 86400),
    counters.add('SPEND#MONTH', month(now), micro, 400 * 86400),
  ]);
}
