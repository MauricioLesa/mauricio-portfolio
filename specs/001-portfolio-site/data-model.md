# Data Model: Portfolio Site with Grounded AI Assistant

**Feature**: `001-portfolio-site` | **Date**: 2026-11-09 | **Plan**: [plan.md](./plan.md)

There are two kinds of data:

1. **Content**: MDX files in the repo, read only through `src/server/content/*`.
2. **Runtime records**: one DynamoDB table, on-demand, `us-east-2`.

Every shape is defined once as a zod schema in `src/server/**/schemas.ts`, and its TypeScript type
comes from `z.infer`.

---

## 1. Content (files in `content/`)

### Project / case study (`content/projects/<slug>.mdx`)

| Field (frontmatter) | Type | Rules |
|---|---|---|
| `slug` | string | Must match the filename. Lowercase letters, digits and hyphens. Unique. |
| `title` | string | 1–80 characters |
| `summary` | string | 1–200 characters, shown on cards |
| `featured` | boolean | Exactly **3** projects across the site must have `featured: true` (FR-002) |
| `featuredRank` | 1 \| 2 \| 3 | Required when featured. Unique. |
| `stack` | string[] | At least 1 entry |
| `images` | `{ src, alt }[]` | Optional. `alt` is required (an empty string means the image is decorative) (FR-028) |
| `publishedAt` | ISO date | |

The **body** must contain the H2 sections `Problem`, `Architecture`, `Trade-offs` and `Results`,
in that order (FR-004). The build fails if any is missing.

### CV (`content/cv.mdx`)

| Field | Type | Rules |
|---|---|---|
| `name`, `headline`, `location` | string | |
| `publicEmail` | email | **The only contact detail allowed anywhere** (FR-005, FR-018) |
| `experience` | `{ company, role, start, end \| null, highlights[] }[]` | Source of truth for "jobs held" (FR-019) |
| `skills` | `{ group, items[] }[]` | Source of truth for "skills claimed" (FR-019) |
| `education` | `{ institution, degree, year }[]` | |
| `pdfVersion` | string | Must match the uploaded PDF's version, so the web CV and the PDF stay in sync (FR-007) |

### Page content (`content/pages/<name>.mdx`)

The names are `home`, `about`, `how-i-work-with-ai`, `architecture` and `guardrails`. Each page's
frontmatter has page-specific fields, all validated:

- `home`: `oneLiner` (≤ 160 characters).
- `about`: `stack[]` must include Node.js, TypeScript, React, Next.js, Docker, Redis, RabbitMQ and
  AWS (FR-003), plus `learningNow[]` (at least 1 entry).
- `how-i-work-with-ai`: `steps[]` in order (FR-023).
- `architecture`: `practices[]` with `{ name, where }`. It must cover the 8 practices listed in
  FR-024.
- `guardrails`: `categories[]` with `{ id, reason, examples[{ prompt, response }] }`. It must cover
  the 4 categories, with at least 1 example each (FR-022).

### Source passage (generated, `content/.generated/index.json`, gitignored)

| Field | Type | Notes |
|---|---|---|
| `id` | string | `<docId>#<sectionSlug>#<n>` |
| `source` | `{ docType: "cv" \| "project", docId, section, title }` | Shown in the trace panel and in citations |
| `text` | string | ~300–500 tokens |
| `embedding` | number[512] | Titan Text Embeddings V2 |
| `indexVersion` | string | A hash of the content, so a stale index can be detected |

---

## 2. Runtime records (DynamoDB table `Portfolio`)

The table uses keys `PK` (string) and `SK` (string). The TTL attribute is `ttl` (epoch seconds).
Billing is on-demand, with point-in-time recovery off, which is acceptable for this data.

| Entity | PK | SK | Attributes | TTL |
|---|---|---|---|---|
| **Rate-limit window** | `RATE#<kind>#<visitorHash>` (`kind` is `chat` or `cv`) | `W#<yyyy-mm-ddThh>` | `count` (number) | 2 h |
| **Spend counter, day** | `SPEND#DAY` | `<yyyy-mm-dd>` | `microUsd` (number) | 40 days |
| **Spend counter, month** | `SPEND#MONTH` | `<yyyy-mm>` | `microUsd` (number) | 400 days |
| **CV grant** | `CVGRANT#<grantId>` | `GRANT` | `issuedAt`, `expiresAt` (ISO), `visitorHash` (kept on purpose for possible future CV-download logging; owner decision 2026-11-09, analysis I4. It is not read today, rotates daily and is never sent to the browser.) | `expiresAt` + 1 h |
| **Conversation** | `CONV#<conversationId>` | `STATE` | `userMessageCount` (0–10), `turns[]` (`{ role, text }`, server-side only), `createdAt`, `closed` (bool) | 2 h |
| **Conversation turn (trace log)** | `TRACE#<yyyy-mm-dd>` | `<isoTimestamp>#<turnId>` | see below | 30 days |
| **Eval run** | `EVALRUN` | `<startedAt>#<runId>` | see below | none |
| **Eval case result** | `EVALRUN#<runId>` | `CASE#<caseId>` | see below | none |
| **Eval trace (AI call log for eval runs)** | `EVALTRACE#<runId>` | `<isoTimestamp>#<caseId>#<callType>` | `callType` (`embedding` \| `chat` \| `judge`), `model`, `usage`, `costUsd`, `latencyMs` | none |

### Conversation turn (trace log)

This record is the constitution's AI log (FR-015) and the source of the trace panel (FR-014).

| Field | Type |
|---|---|
| `turnId`, `conversationId` | string (UUID) |
| `question` | string (≤ 1,000 characters). Never stores IP or visitor identity. |
| `answer` | string |
| `outcome` | `"answered" \| "refused" \| "blocked" \| "error" \| "limited" \| "unavailable"` |
| `retrieved` | `{ passageId, source, score }[]` |
| `model` | string (Bedrock model ID) |
| `usage` | `{ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }` |
| `costUsd` | number: chat + retrieval (embedding) cost, from the price table version `pricingVersion` |
| `costBreakdownUsd` | `{ chat, retrieval }` |
| `truncated` | boolean: the answer hit `max_tokens` and was ended with "(answer shortened)" |
| `latencyMs` | `{ firstToken, total, retrieval }` |
| `errorCode` | string, optional |
| `reason` | Only on blocked traces (`limited` / `unavailable`): `rate_limited` \| `message_too_long` \| `conversation_closed` \| `daily_cap` \| `monthly_cap`. Blocked traces have no `model`, `usage`, `costUsd` or `retrieved` fields. |

**Outcome transitions** (one per turn):

```text
received ─► limited      (rate limit / conversation limit / message too long: no model call)
         ─► unavailable  (spending cap reached: no model call)
         ─► retrieving ─► generating ─► answered
                                     ├► refused   (refusal marker or stop_reason "refusal")
                                     ├► blocked   (output filter tripped)
                                     └► error     (provider failure or timeout)
```

### Eval run (summary)

| Field | Type |
|---|---|
| `runId` | string |
| `startedAt`, `finishedAt` | ISO |
| `model`, `judgeModel` | string |
| `gitSha` | string |
| `caseCount`, `passed` | number |
| `passRate` | number (0–1) |
| `passRateByCategory` | record of category → number |
| `avgCostUsd` | number (assistant cost per case; judge cost is reported separately as `judgeCostUsd`) |
| `latencyMs` | `{ p50, p95 }` (total), `{ p50, p95 }` (first token) |

### Eval case result

`caseId`, `category`, `passed`, `answer`, `reason` (from the deterministic check or the judge),
`costUsd`, `latencyMs`.

### Eval case (file, `evals/cases/*.json`)

| Field | Type | Rules |
|---|---|---|
| `id` | string | Unique |
| `category` | `"on-topic" \| "off-topic" \| "system-prompt" \| "contact-data" \| "unsupported-claim"` | Coverage: on-topic ≥ 20; each other category ≥ 5 (FR-025) |
| `messages` | string[] | 1–3 visitor messages (multi-turn and injection cases) |
| `expect` | `{ type: "refusal" } \| { type: "answer", mustMention?: string[], mustNotMention?: string[], rubric?: string }` | |

---

## 3. Relationships

- A **Project** and the **CV** are split into many **Source passages** at build time.
- A **Conversation** has 1–10 visitor messages. Each produces one **Conversation turn** record,
  which references many **Source passages** by `passageId`.
- An **Eval run** has many **Eval case results**, and each result references one **Eval case**
  by `caseId`.
- A **CV grant** is standalone. Each one belongs to the visitor who requested it, recorded only as
  a hash for rate limiting.
