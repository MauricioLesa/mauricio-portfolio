# Deploy hand-off: MVP skeleton (T118 → T119)

**For**: the owner, who runs every AWS command (constitution Principle V).
**Scope**: the US1 portfolio (Home, About, Projects, case studies, CV page) on the CloudFront
default domain. No assistant, no CV download, no custom domain yet.
**Prepared**: 2026-11-14, branch `feat/skeleton-deploy`. Locally verified by T117: `npm run build`,
`npm run package:lambda`, `cdk synth` (no credentials needed) and `npm run test` (32 tests, including
13 CDK assertions) all pass.

---

## 1. Resources created

All in `us-east-2` except the global ones (CloudFront, IAM, Budgets). Costs are the plan.md cost lines
(monthly, typical traffic).

| Resource | Details | Cost (plan.md) |
|---|---|---|
| DynamoDB table `Portfolio` | `PK`/`SK`, on-demand, TTL `ttl`, PITR off, **retained** on stack delete | $0.01 |
| S3 static bucket | Block Public Access, SSE-S3, SSL enforced, read only by CloudFront (OAC); holds `_next/static/*` and `public/*`; **retained** on stack delete | $0.03 (S3 line, shared with CDK assets) |
| Lambda function + function URL | Node 22, arm64, 1024 MB, 30 s, reserved concurrency 10 (off while the account quota is 10, see section 3), Web Adapter layer `LambdaAdapterLayerArm64:30`; URL is `AWS_IAM` + `RESPONSE_STREAM` | $0.00 (always-free tier) |
| CloudWatch log group for the function | 30-day retention (owner decision G3) | $0.00 (5 GB free) |
| CloudFront distribution | `*.cloudfront.net`, PriceClass 100, HTTP/2+3; OAC for S3 and for the function URL; behaviors `/_next/static/*` → S3, `/api/*` → Lambda (no cache), `/*` → Lambda (follows origin `Cache-Control`); 1 cache policy, 2 origin-request policies | $0.00 (always-free tier) |
| BucketDeployment helper Lambda (+ AWS CLI layer) | Copies `.next/static` and `public/` into the bucket on deploy | $0.00 |
| Invalidation custom resource Lambda | Invalidates `/*` once per new build; IAM scoped to this distribution only | $0.00 |
| IAM roles (3) | Server function (5 DynamoDB item actions on the table ARN only), BucketDeployment, invalidation | $0.00 |
| AWS Budget `portfolio-monthly` | $10/month, email on ACTUAL spend > $5 and > $8 | $0.00 (first 2 budgets free) |

**MVP total: about $0.05/month.**

Nothing here costs money while idle: no VPC, no NAT gateway, no Secrets Manager secret, no provisioned
concurrency (the CDK tests assert this).

---

## 2. Prerequisites (once)

- [ ] `aws sso login --profile dev`
- [ ] **Lambda concurrency quota.** This account's limit is **10** (checked 2026-11-14), so
      `infra/cdk.json` sets `"reservedConcurrency": 0` (no reservation; see section 3). Request an
      increase to 1000 (free) in *Service Quotas → AWS Lambda → Concurrent executions* in `us-east-2`.
- [ ] **CDK bootstrap**, if `us-east-2` isn't bootstrapped yet (this creates the CDK staging bucket and
      roles, at about $0):
      `npx cdk bootstrap aws://<account-id>/us-east-2 --profile dev`
- [ ] **`BUDGET_ALERT_EMAIL`**: pass it as CDK context (`-c budgetAlertEmail=<you>`) or set the env var.
      Synth refuses to run without it (FR-033). CDK doesn't read `.env.local`; keep the address out of
      committed files (`cdk.json`, `cdk.context.json`).
- [ ] **Verify the Web Adapter layer**: in the [aws-lambda-web-adapter README](https://github.com/awslabs/aws-lambda-web-adapter),
      confirm `LambdaAdapterLayerArm64:30` is still the current Zip layer (it was on 2026-11-14,
      README release 1.1.0). If you change it, edit `WEB_ADAPTER_LAYER_ARN` in `infra/lib/portfolio-stack.ts`.

---

## 3. Known gaps

- **No reserved concurrency while the account quota is 10.** AWS keeps 10 executions unreserved, so
  reserving any amount fails the deploy ("decreases account's UnreservedConcurrentExecution below its
  minimum value of [10]"). At a quota of 10 the account caps the function at 10 anyway. **Once the
  quota is raised, delete the two `reservedConcurrency` lines from `infra/cdk.json` and redeploy**, so
  the function reserves 10 again (the cost brake from research.md R5).

- **"Download CV" returns 404** until US2 (T049–T056) is deployed. The CV *page* works.
- **`NEXT_PUBLIC_SITE_URL` isn't set on the first deploy.** The function can't read the distribution's
  domain (that would be a CloudFormation cycle), so it comes from `-c siteUrl=…`. Nothing in the MVP
  reads it yet (the sitemap is T048). After the first deploy, pass the `SiteUrl` output back on later
  deploys. `NEXT_PUBLIC_*` values are also inlined at build time, so export it before `npm run build` too.
- **POST to `/api/*` needs an `x-amz-content-sha256` header** because of OAC (research.md R1b). That
  only matters for the assistant (US3); the MVP has no POST flows.

---

## 4. Deviations from tasks.md (for review in `cdk diff`)

1. **Page cache key (T115)**: arbitrary query strings are excluded, but Next's `_rsc` parameter and the
   `rsc` / `next-router-prefetch` headers are in the key. Next 16's CDN guide
   (`node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md`) says they must be, or CloudFront can
   serve cached HTML to client-side navigations. `/cv?link=<script>` still shares `/cv`'s cache entry.
2. **Lambda code is a zip** (`infra/.build/lambda.zip`), written by `scripts/package-lambda.ts` with Unix
   file modes. The Web Adapter runs `exec $LAMBDA_TASK_ROOT/run.sh`, and a zip made by CDK on Windows
   drops the execute bit. The unpacked tree is still in `infra/.build/lambda/`.
3. **`public/` and `.next/static/` are copied into the Lambda package** (owner decision I2, option A),
   as well as being uploaded to S3.
4. **Invalidation** uses a scoped custom resource, not BucketDeployment's `distribution` option, which
   grants `cloudfront:CreateInvalidation` on `Resource: "*"`.
5. **`crossRegionReferences`** is on only when `DOMAIN_NAME` is set (owner decision I3), so the MVP
   stack is account-agnostic and synths without credentials.

---

## 5. Commands for T119

From the repo root:

```sh
aws sso login --profile dev
npm ci
(cd infra && npm ci)
npm run test                      # 32 tests, including the CDK assertions
npm run build
npm run package:lambda            # → infra/.build/lambda.zip (≈ 10 MB)
```

From `infra/`:

```sh
npx cdk diff   --profile dev -c budgetAlertEmail=<you@example.com>
# Review the diff: resources should match section 1, and the IAM changes should match section 1's roles.
npx cdk deploy --profile dev -c budgetAlertEmail=<you@example.com>
# Note the SiteUrl output: https://<id>.cloudfront.net
```

Optional: run the smoke tests against the deployed site (from the repo root):

```sh
PLAYWRIGHT_BASE_URL=https://<id>.cloudfront.net npx playwright test \
  tests/e2e/home.smoke.spec.ts tests/e2e/about.smoke.spec.ts \
  tests/e2e/projects.smoke.spec.ts tests/e2e/project-detail.smoke.spec.ts
```

Later deploys (after the first): add `-c siteUrl=https://<id>.cloudfront.net`, and
`export NEXT_PUBLIC_SITE_URL=https://<id>.cloudfront.net` before `npm run build`.

---

## 6. Results (fill in after T119)

- Deployed on: ____  ·  CloudFront URL: `https://__________.cloudfront.net`
- [ ] `cdk diff` reviewed; resources match section 1
- [ ] `cdk deploy` succeeded
- [ ] Budget `portfolio-monthly` shows in the Billing console with the $5 and $8 alerts
- [ ] Home loads (`/`)
- [ ] About loads (`/about`)
- [ ] Projects list loads (`/projects`)
- [ ] Every case study loads (`/projects/<slug>` for each project)
- [ ] CV page loads (`/cv`); "Download CV" 404s (expected until US2)
- [ ] `/_next/static/*` responses come from S3 (`x-cache` header; `cache-control: …immutable`)
- [ ] Client-side navigation works (click between pages; there should be no full reloads)
- [ ] The function URL is **not** reachable directly (`curl <function-url>` → 403)
- [ ] Optional: Playwright smoke tests against the deployed URL pass
- Notes / issues: ____
