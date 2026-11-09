# Contract: Server modules (`src/server/`)

These are the functions that pages and route handlers may call. Everything under `src/server/` is
**framework-free TypeScript**: no imports from `next/*` or `react`. ESLint enforces this with
`no-restricted-imports`. Pages never read `content/` or call `fs` directly; that is also enforced
by ESLint, which allows `fs` only inside `src/server/content/`.

The types come from the zod schemas in [data-model.md](../data-model.md).

## Content (`src/server/content/`)

```ts
getProjects(): Promise<ProjectSummary[]>             // sorted by publishedAt desc
getFeaturedProjects(): Promise<ProjectSummary[]>     // exactly 3, by featuredRank
getProject(slug: string): Promise<Project | null>    // includes MDX body source
getProjectSlugs(): Promise<string[]>                 // for generateStaticParams
getCv(): Promise<Cv>
getPage<N extends PageName>(name: N): Promise<PageContent<N>>  // home | about | how-i-work-with-ai | architecture | guardrails
getPublicEmail(): Promise<string>                    // the single allowed contact detail
```

All of these validate content with zod and throw `ContentError` on invalid content, which fails
the build.

## Assistant (`src/server/assistant/`)

```ts
type ChatEvent =
  | { type: "meta"; conversationId: string; turnId: string; remainingMessages: number }
  | { type: "retrieval"; passages: RetrievedPassage[] }
  | { type: "delta"; text: string }
  | { type: "done"; outcome: "answered" | "refused" | "blocked"; citations: string[]; replacementText?: string; trace: TurnTrace }
  | { type: "error"; code: string; message: string; retryable: boolean };

type ChatResult =
  | { ok: true; events: AsyncIterable<ChatEvent> }
  | { ok: false; reason: "rate_limited" | "assistant_unavailable" | "conversation_closed" | "conversation_not_found"; retryAfterSeconds?: number };

chat(input: { conversationId?: string; message: string; visitorHash: string; budget?: "site" | "eval" }, deps?: AssistantDeps): Promise<ChatResult>

retrieve(question: string, k?: number): Promise<RetrievedPassage[]>   // embeddings + cosine search
estimateCostUsd(model: string, usage: Usage): number                   // versioned price table
```

`AssistantDeps` covers the model client, the embedder, the store, the clock and the logger. These
are injected so Vitest can test `chat()` with fakes and no AWS calls.

## CV (`src/server/cv/`)

```ts
issueCvLink(visitorHash: string): Promise<{ ok: true; grantId: string } | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }>
resolveCvGrant(grantId: string): Promise<{ ok: true; url: string } | { ok: false; reason: "expired" | "not_found" }>
```

## Limits (`src/server/limits/`)

```ts
checkAndCountRate(kind: "chat" | "cv", visitorHash: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }>
checkSpend(): Promise<{ allowed: boolean; resetsAt?: string }>
recordSpend(costUsd: number): Promise<void>
visitorHash(clientIp: string, now: Date): string   // HMAC with VISITOR_HASH_SECRET, rotates daily
```

## Evals (`src/server/evals/`)

```ts
getEvalRuns(limit?: number): Promise<EvalRunSummary[]>   // newest first; [] when none (empty state)
getEvalRun(runId: string): Promise<{ summary: EvalRunSummary; cases: EvalCaseResult[] } | null>
```

## Config and logging (`src/server/config.ts`, `src/server/log.ts`)

- `config` is parsed once from `process.env` with zod. The app fails fast if anything is missing
  or invalid. The variables are listed in `.env.example`; see [quickstart](../quickstart.md).
- `log.aiCall({ model, usage, costUsd, latencyMs, outcome, turnId })` writes one structured JSON
  line per model call (constitution Principle VII). It never logs secrets or visitor identity.
