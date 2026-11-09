# Implementation Plan: Portfolio Site with Grounded AI Assistant

**Branch**: `001-portfolio-site` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-portfolio-site/spec.md`

## Summary

The site is a portfolio of nine pages plus an AI assistant grounded in the CV and case studies.

- **Pages**: built with the Next.js App Router in strict TypeScript, with content in MDX files in
  the repo.
- **Hosting**: a single Lambda function running the Next.js standalone server through the Lambda
  Web Adapter, with response streaming. CloudFront sits in front, and S3 serves static assets and
  the private CV PDF. Everything runs in `us-east-2`.
- **Assistant**: calls **Claude Haiku 5.5 on Bedrock**. It retrieves passages from a precomputed
  Titan embeddings index held in memory.
- **Storage**: rate limits, spending caps, CV link grants, traces and eval results go in one
  on-demand DynamoDB table.
- **Analytics**: Umami Cloud's free plan, which is cookieless.
- **Infrastructure**: AWS CDK in TypeScript. The owner runs every `cdk diff` and `cdk deploy`.

**Estimated cost**: about **$2.15 per month** typically, or $3.90 with a custom domain. At the
worst case, when every cap is reached, it is **about $8.50**. Details are in the
[cost table](#cost-estimate-monthly) below.

## Technical Context

**Language/Version**: TypeScript 5.x with `strict: true`, on Node.js 22 LTS (Lambda `nodejs22.x`,
arm64).

**Primary Dependencies** (each has its reason under Constitution Check, Principle VIII):
- Framework: `next`, `react`, `react-dom`.
- Validation: `zod`.
- Content: `gray-matter`, `next-mdx-remote`.
- AI: `@anthropic-ai/bedrock-sdk` for Claude. `@aws-sdk/client-bedrock-runtime` for Titan
  embeddings.
- AWS: `@aws-sdk/client-dynamodb` and `@aws-sdk/lib-dynamodb` for storage. `@aws-sdk/client-s3`
  and `@aws-sdk/s3-request-presigner` for the CV links. `@aws-sdk/client-ssm` for the secret.
- Infrastructure: `aws-cdk-lib`, `constructs`, `aws-cdk`.
- Tooling: `vitest`, `@playwright/test`, `@axe-core/playwright`, `tsx`, and ESLint (Next.js's
  default config).
- Outside npm: the AWS Lambda Web Adapter (a Lambda layer) and the Umami script tag.

**Storage**:
- MDX files in `content/`.
- A generated embeddings index (`content/.generated/index.json`, bundled with the server).
- DynamoDB table `Portfolio` (on-demand, TTL enabled).
- A private S3 bucket for the CV PDF, plus a separate S3 bucket for static assets.

**Testing**:
- Vitest for unit tests of `src/server/**`, with AWS clients faked through dependency injection.
- Playwright: one smoke test per page, axe WCAG AA scans, and keyboard-only flows.
- An eval runner (`npm run eval`) for the assistant.

**Target Platform**: modern evergreen browsers (desktop and mobile). The server runs on AWS Lambda
behind CloudFront.

**Project Type**: web application (one Next.js app plus a CDK app in `infra/`).

**Performance Goals**:
- Main content visible in ≤ 2 s on 4G (SC-001). Pages are statically generated and cached by
  CloudFront.
- The assistant's first token in ≤ 3 s for 95% of questions (SC-002).

**Constraints**:
- Under $10/month in total (SC-003).
- Model spending capped at $0.25/day and $5/month (FR-021).
- Content pages work without JavaScript (FR-029).
- WCAG AA (FR-028).
- Region `us-east-2`; `us-east-1` is used only for the CloudFront certificate.

**Scale/Scope**:
- Traffic: about 1,000 visits, 4,000 page views, 500 assistant messages and 100 CV downloads per
  month.
- About 10 pages, 3–8 case studies, under 100 retrieval passages and about 70 eval cases.

All earlier unknowns are resolved in [research.md](./research.md) (R1–R12). Items marked
**Verify** there are price and availability checks the owner confirms before the first deploy;
none of them changes the design.

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1 design. Result: **PASS** both times.*

| # | Principle | How this plan complies | Status |
|---|---|---|---|
| I | Tested features | Vitest covers every `src/server` module, using injected fakes. There is one Playwright smoke test per page: Home, About, CV, Projects list, a case study, Assistant, Guardrails, How I work with AI, Evals and Architecture. CI runs `typecheck`, `lint`, `test` and `test:e2e`, and a merge is blocked if any fails. | ✅ |
| II | Server-side validation and secrets | zod validates `POST /api/chat`, the `/api/cv/file/{grantId}` path parameter, all environment config and all content frontmatter. There is one secret, an SSM SecureString created by the owner and read at runtime; it is not in the repo or in Lambda's environment. The only `NEXT_PUBLIC_` variables are the public site URL and the Umami website ID, which are not secrets. | ✅ |
| III | Least-privilege IAM, no long-lived keys | The Lambda role is limited to: `bedrock:InvokeModel*` on the Haiku 5.5 model or inference-profile ARNs and on Titan V2; `dynamodb:GetItem/PutItem/UpdateItem/Query` on the one table; `s3:GetObject` on the single CV object; `ssm:GetParameter` on the one parameter. The owner deploys and runs evals with SSO session credentials. If CI ever needs AWS, it uses GitHub OIDC. **Justified wildcard**: if Haiku 5.5 is only available through the `us.` cross-region profile, the policy needs a region wildcard (`arn:aws:bedrock:*::foundation-model/anthropic.claude-haiku-5-5*`) because the profile can route to any US region. It still names one model. | ✅ (wildcard justified) |
| IV | Cost ceiling, serverless first | Everything is serverless or pay-per-request. The paid and always-on items are listed in the cost table: the Route 53 hosted zone ($0.50) and the domain (~$1.25), both optional. App Runner is rejected because it is always-on. The worst case with every cap reached is about $8.50 with a custom domain, under $10. | ✅ |
| V | Human-approved infrastructure | The agent writes `infra/` (CDK) and `.env.example` and stops. The owner runs `cdk diff` and `cdk deploy` and creates the SSM secret. Every environment variable is listed in [quickstart.md](./quickstart.md) and `.env.example` with its purpose. | ✅ |
| VI | Accessibility | Semantic layout landmarks and a skip link. Charts are inline SVG with a data table alternative. The diagram has `<title>` and `<desc>` plus an equivalent text explanation. The chat is fully keyboard-operable and announces streaming text with `aria-live="polite"`. An axe scan runs in every Playwright smoke test (SC-007). | ✅ |
| VII | Observable, evaluated AI | Each model call writes one structured log line with model, tokens, cost and latency, and one trace record in DynamoDB (FR-014, FR-015). The eval set has at least 20 on-topic cases and at least 5 per guardrail category. The 100% guardrail and ≥ 90% on-topic thresholds are a release gate. Eval results appear on the Evals page. | ✅ |
| VIII | Simplicity, justified dependencies | Reasons are listed below. Things rejected to keep it simple: a vector database, a chart library, OpenNext, server actions (v1), Secrets Manager and CloudWatch RUM. | ✅ |

**Dependency reasons (Principle VIII)**

| Dependency | Reason |
|---|---|
| `next`, `react`, `react-dom`, `typescript` | Stack required by the constitution |
| `zod` | Server-side validation required by the constitution; also validates config and content |
| `gray-matter` | Reads MDX frontmatter as plain data, so the content functions and the index script don't need to compile MDX |
| `next-mdx-remote` | Renders MDX bodies in server components from strings returned by `getProject()` |
| `@anthropic-ai/bedrock-sdk` | Official SDK for Claude on Bedrock (Mantle client), with streaming and typed usage |
| `@aws-sdk/client-bedrock-runtime` | Titan embeddings, which aren't a Claude model so the Anthropic SDK doesn't cover them |
| `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` | Rate limits, spending caps, grants, traces and evals |
| `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` | Presigned URLs for the private CV PDF |
| `@aws-sdk/client-ssm` | Reads the one SecureString secret at cold start |
| `aws-cdk-lib`, `constructs`, `aws-cdk` (dev) | Infrastructure as code, required by the constitution workflow |
| `vitest`, `@playwright/test` (dev) | Tests required by the constitution |
| `@axe-core/playwright` (dev) | Automated WCAG AA checks for SC-007 |
| `tsx` (dev) | Runs the TypeScript scripts (index build, eval runner) without a separate build step |
| ESLint and `eslint-config-next` (dev) | Next.js default; also enforces that `src/server` stays framework-free and that pages read content only through the content functions |
| AWS Lambda Web Adapter (layer) | Runs the unmodified Next.js standalone server on Lambda with response streaming |
| Umami script (CDN) | Cookieless analytics for FR-034–FR-036 at $0 |

## Cost Estimate (monthly)

Assumptions: about 1,000 visits, 4,000 page views (~40k CloudFront requests, ~1 GB transfer), 500
assistant messages, 100 CV downloads and 4 eval runs per month. Rates are as of 2026-11-09; see
[research.md](./research.md) for the **Verify** items.

| Service | What it's for | Pricing basis | Typical | Worst case (caps reached) |
|---|---|---|---|---|
| CloudFront | CDN in front of everything | Always free: 1 TB out, 10M requests | $0.00 | $0.00 |
| Lambda (+ function URL) | Next.js server and API | Always free: 1M requests, 400k GB-s. ~10k invocations × ~1 GB × ~0.5 s | $0.00 | $0.00 |
| S3 | Static assets, CV PDF, CDK assets | ~$0.023/GB-month storage plus requests; < 1 GB | $0.03 | $0.05 |
| DynamoDB (on-demand) | Limits, caps, grants, traces, evals | ~5k writes and ~5k reads per month; storage free up to 25 GB | $0.01 | $0.05 |
| Bedrock: Claude Haiku 5.5 | Assistant answers | ~$0.0009/message × 500 | $0.45 | **$5.00** (monthly cap) |
| Bedrock: Titan Embeddings V2 | Question and index embeddings | ~30k tokens indexed + ~25k tokens of queries | <$0.01 | <$0.01 |
| Bedrock: Claude Opus 5.5 (eval judge) | Grades about 25 cases per eval run | ~$0.35/run × 4 runs; each run is limited to `EVAL_MAX_COST_USD` = $1 | $1.40 | $1.40 (4 runs) |
| Bedrock: Claude Haiku 5.5 (eval answers) | Assistant answers during eval runs | ~70 cases × $0.0009 × 4 | $0.25 | $0.25 |
| CloudWatch Logs | Lambda and AI-call logs | Always free up to 5 GB | $0.00 | $0.00 |
| SSM Parameter Store | One SecureString | Standard tier is free | $0.00 | $0.00 |
| AWS Budgets | $5 and $8 alerts (FR-033) | First 2 budgets are free; this uses 1 | $0.00 | $0.00 |
| ACM (us-east-1) | TLS certificate for CloudFront | Free | $0.00 | $0.00 |
| Route 53 hosted zone *(optional, paid always-on)* | Custom domain DNS | $0.50 per hosted zone | $0.50 | $0.50 |
| Domain registration *(optional, paid)* | e.g. a `.com` | ~$14–15 per year | $1.25 | $1.25 |
| Umami Cloud *(not AWS)* | Analytics | Hobby plan, free | $0.00 | $0.00 |
| **Total without a custom domain** | | | **≈ $2.15** | **≈ $6.75** |
| **Total with a custom domain** | | | **≈ $3.90** | **≈ $8.50** |

Not used, which keeps costs at $0: Secrets Manager ($0.40/secret), provisioned concurrency, App
Runner (~$5+ idle), OpenSearch Serverless (~$170+), NAT gateways and VPCs (the Lambda needs no
VPC), KMS customer-managed keys (S3 uses SSE-S3 and DynamoDB uses AWS-owned keys).

## Architecture

```text
Visitor ──HTTPS──► CloudFront (global; ACM cert in us-east-1; optional Route 53)
                     ├─ /_next/static/*, /images/*  ──OAC──► S3 static bucket (us-east-2)
                     ├─ /api/*  (no cache)           ──OAC──► Lambda function URL (RESPONSE_STREAM)
                     └─ /*      (cache by origin header)──OAC──► Lambda function URL
Lambda (us-east-2, arm64, 1 GB, reserved concurrency 10)
  Next.js standalone via Lambda Web Adapter
   ├─ Bedrock: Claude Haiku 5.5 (chat, streaming) and Titan Embeddings V2
   ├─ DynamoDB "Portfolio" (limits, spend, grants, conversations, traces, evals)
   ├─ S3 private bucket: cv.pdf (presigned GET, 60 s)
   └─ SSM SecureString: visitor-hash secret (read at cold start)
Browser ──► Umami Cloud (cookieless analytics script + custom events)
Owner laptop (SSO) ──► cdk diff / cdk deploy · npm run index:build · npm run eval
AWS Budgets ──email──► owner at $5 and $8
```

The site's assistant is built so that each piece can be replaced on its own:

- `src/server/assistant/chat.ts` coordinates the steps: limits → retrieval → prompt → stream →
  output filter → log and spend.
- Each external piece (the model client, the embedder, the store) is passed in rather than
  imported directly.

## Project Structure

### Documentation (this feature)

```text
specs/001-portfolio-site/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R12
├── data-model.md        # Phase 1: content schemas and DynamoDB items
├── quickstart.md        # Phase 1: run, test, eval, deploy, validation scenarios
├── contracts/
│   ├── http-api.md      # /api/chat (SSE), /api/cv/link, /api/cv/file/{id}, analytics events
│   └── server-modules.md# src/server function signatures
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/
├── app/                              # Next.js App Router: thin, no business logic
│   ├── layout.tsx                    # nav (room for a future page), skip link, Umami script, web-vitals reporter
│   ├── page.tsx                      # Home
│   ├── about/page.tsx
│   ├── cv/page.tsx                   # HTML CV (static, reads no query parameters)
│   ├── cv/link-expired/page.tsx      # static: "link expired, request a new one"
│   ├── cv/too-many-requests/page.tsx # static: "try again later"
│   ├── projects/page.tsx
│   ├── projects/[slug]/page.tsx      # generateStaticParams from getProjectSlugs()
│   ├── assistant/page.tsx            # chat + trace panel (client components)
│   ├── guardrails/page.tsx
│   ├── how-i-work-with-ai/page.tsx
│   ├── evals/page.tsx                # dynamic; Cache-Control s-maxage=300
│   ├── architecture/page.tsx
│   ├── robots.ts                     # disallow /api/
│   └── api/
│       ├── chat/route.ts             # zod → chat() → SSE
│       └── cv/
│           ├── link/route.ts         # → issueCvLink()
│           └── file/[grantId]/route.ts  # zod → resolveCvGrant()
├── components/                       # UI only (Nav, ProjectCard, Chat, TracePanel, LineChart, DataTable, …)
├── shared/                           # zod schemas and types used by client and server (ChatEvent, ChatRequest)
└── server/                           # framework-free TypeScript (no next/* or react imports; enforced by lint)
    ├── config.ts                     # zod-parsed env
    ├── log.ts                        # structured logs, log.aiCall()
    ├── content/                      # getProjects(), getProject(), getFeaturedProjects(), getCv(), getPage()
    ├── assistant/                    # chat.ts, retrieval.ts, prompt.ts, guardrails.ts, pricing.ts
    ├── cv/                           # issueCvLink(), resolveCvGrant()
    ├── limits/                       # rate limits, spend caps, visitorHash()
    ├── evals/                        # getEvalRuns(), getEvalRun()
    ├── store/                        # DynamoDB repository functions (one table)
    └── aws/                          # client factories (Bedrock Mantle, Bedrock runtime, DynamoDB, S3, SSM)

content/
├── cv.mdx
├── pages/{home,about,how-i-work-with-ai,architecture,guardrails}.mdx
├── projects/*.mdx
└── .generated/index.json             # gitignored, built by scripts/build-index.ts

evals/
├── cases/*.json                      # eval set (≥20 on-topic, ≥5 per guardrail)
└── run.ts                            # eval runner → DynamoDB

scripts/
├── build-index.ts                    # chunk + embed → content/.generated/index.json
└── check-content.ts                  # zod-validate all content

infra/                                # AWS CDK (TypeScript); owner deploys
├── bin/portfolio.ts
└── lib/
    ├── certificate-stack.ts          # us-east-1: ACM cert (only if DOMAIN_NAME set)
    └── portfolio-stack.ts            # us-east-2: S3 ×2, DynamoDB, Lambda + URL, CloudFront, Budget, IAM

tests/
├── unit/                             # Vitest, mirrors src/server/**
└── e2e/                              # Playwright: one *.smoke.spec.ts per page, a11y, keyboard

private/cv.pdf                        # gitignored; uploaded by CDK BucketDeployment
.env.example                          # every env var with its purpose
```

**Structure Decision**: one Next.js app with a framework-free `src/server/` layer, plus a separate
CDK app in `infra/`. Route handlers only validate with zod and call a single `src/server`
function. Pages read content only through `src/server/content/*`. These rules are enforced by
ESLint `no-restricted-imports` (no `next/*` or `react` in `src/server`; no `fs` or `content/`
imports outside `src/server/content`). That keeps the business logic ready to move behind a
separate API later. Server actions are not used in v1 (see research R1b).

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Haiku 5.5 isn't enabled in `us-east-2`, or is only offered through the `us.` profile | Verify before deploying; the model ID is a config value; IAM wildcard justified above |
| Lambda cold start pushes first-token time past 3 s | CloudFront caches pages; 1 GB arm64; measure with V8 and V17; add a free scheduled warm-up only if needed |
| CloudFront OAC needs the `x-amz-content-sha256` header on POST | The chat client sends it via Web Crypto; the CV flow uses GET; fallback is a secret origin header (R1b) |
| A bot drains the model budget | Per-visitor limits, daily and monthly caps, conversation limit, reserved concurrency 10, budget alerts (R5) |
| Prompt injection or a leaked system prompt | Layered guardrails: input checks, canary string, streaming output filter, 100% guardrail evals (R6) |
| Umami free-plan limits change | Traffic is about 6% of the reported 100k-event limit; CloudWatch RUM (~$0.05) is the documented fallback |

## Complexity Tracking

No constitution violations. The one IAM region wildcard is justified in the Constitution Check
(Principle III) and applies only if the cross-region inference profile is needed.
