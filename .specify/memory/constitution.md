<!--
Sync Impact Report
- Version change: (unfilled template) → 1.0.0
- Modified principles: all template placeholders replaced (initial adoption)
- Added principles:
  I. Tested Features (NON-NEGOTIABLE)
  II. Server-Side Validation & Secret Hygiene
  III. Least-Privilege AWS Access
  IV. Cost Ceiling & Serverless First
  V. Human-Approved Infrastructure (NON-NEGOTIABLE)
  VI. Accessibility (WCAG AA Basics)
  VII. Observable, Evaluated AI Features
  VIII. Simplicity & Justified Dependencies
- Added sections: Technology Stack & Deployment Constraints; Development Workflow & Quality Gates;
  Governance
- Removed sections: none
- Templates: not modified by this command (they read the constitution at runtime)
- Deferred TODOs: none
-->

# Mauricio Portfolio Constitution

## Core Principles

### I. Tested Features (NON-NEGOTIABLE)

- Every feature MUST ship with tests: Vitest unit tests for its logic and at least one
  Playwright smoke test for every page it adds or changes.
- A change MUST NOT be merged while any test fails. Skipping or disabling a failing test to
  get a merge through is a violation.

Rationale: tests are the only evidence that a feature works, and a red suite that is tolerated
once stops meaning anything.

### II. Server-Side Validation & Secret Hygiene

- All user input MUST be validated with zod on the server (route handlers, server actions)
  before it is used. Client-side validation is a convenience only, never the gate.
- Secrets MUST live only in server-side environment variables or AWS Secrets Manager.
- Secrets MUST NEVER use a `NEXT_PUBLIC_` prefix and MUST NEVER be committed to the repository,
  including in examples, fixtures, or test files.

Rationale: anything prefixed `NEXT_PUBLIC_` or committed to git is effectively public.

### III. Least-Privilege AWS Access

- AWS access MUST use IAM roles with least-privilege policies scoped to the specific actions
  and resources a component needs.
- Long-lived IAM access keys MUST NOT be created or used, locally, in CI, or at runtime.
- Wildcard actions or resources (`*`) in a policy MUST be justified in the plan.

Rationale: short-lived, narrowly scoped credentials limit the damage of any leak.

### IV. Cost Ceiling & Serverless First

- Total AWS spend MUST stay under $10/month.
- Designs MUST prefer serverless and always-free services, so that an idle, low-traffic site
  costs close to nothing.
- Any paid or always-on resource MUST be named in the feature plan with its estimated monthly
  cost before it is introduced.

Rationale: a personal portfolio has negligible traffic; idle cost is the cost that matters.

### V. Human-Approved Infrastructure (NON-NEGOTIABLE)

- The agent MUST NOT create, change, or delete AWS resources, API endpoints, IAM permissions,
  secrets, or environment variables on its own.
- The agent writes the code (CDK, configuration) and stops. The owner reviews the diff and runs
  `cdk diff` and `cdk deploy` personally.
- Every new environment variable MUST be listed in `.env.example` with a description of its
  purpose (and no real value).

Rationale: infrastructure changes cost money, affect security, and are hard to reverse; a human
reviews each one before it reaches AWS.

### VI. Accessibility (WCAG AA Basics)

- Pages MUST use semantic HTML (landmarks, headings in order, real buttons and links).
- Every meaningful image MUST have descriptive alt text; decorative images MUST use empty alt.
- All interactive elements MUST be reachable and operable by keyboard with a visible focus
  indicator.
- Text and UI contrast MUST meet WCAG AA.

Rationale: a portfolio is a public face; it has to work for everyone who visits it.

### VII. Observable, Evaluated AI Features

- Every AI feature MUST log, per call: model, input and output tokens, estimated cost, and
  latency.
- Every AI feature MUST have an eval set, and its results MUST be reviewed before the feature
  ships.

Rationale: without logs, cost and regressions are invisible; without evals, quality is a guess.

### VIII. Simplicity & Justified Dependencies

- A new dependency MUST NOT be added without a stated reason in the plan or pull request
  explaining why existing code or the platform cannot do the job.
- Prefer the simplest design that meets the spec; added complexity MUST be justified.

Rationale: every dependency is code to audit, update, and pay for in bundle size.

## Technology Stack & Deployment Constraints

- Framework: Next.js with the App Router.
- Language: TypeScript with `strict` mode enabled; disabling strictness or adding broad
  `any`/`@ts-ignore` escapes MUST be justified.
- Validation: zod on the server.
- Testing: Vitest (unit) and Playwright (page smoke tests).
- Hosting: AWS, region `us-east-2`. `us-east-1` is used only where AWS requires it (for example,
  ACM certificates for CloudFront).
- Infrastructure as code: AWS CDK, deployed manually by the owner (see Principle V).

## Development Workflow & Quality Gates

- Each feature follows the Spec Kit flow: specify → plan → tasks → implement.
- Every plan MUST include a Constitution Check covering: tests to be added, inputs validated,
  secrets and env vars introduced (with `.env.example` entries), IAM permissions requested,
  paid or always-on resources with estimated monthly cost, accessibility considerations, AI
  logging and eval set (if applicable), and justification for each new dependency.
- Merge gate: all Vitest and Playwright tests pass; TypeScript compiles under strict mode.
- Infrastructure gate: any CDK or config change that touches AWS is handed to the owner for
  `cdk diff` review and `cdk deploy`; the agent stops at that point.

## Governance

- This constitution supersedes other project practices. Where a spec, plan, or task conflicts
  with it, the constitution wins until it is amended.
- Amendments are made through `/speckit-constitution`, approved by the owner, and recorded with
  a version bump and updated Last Amended date.
- Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR
  for adding a principle or materially expanding guidance, PATCH for clarifications and wording.
- Every plan and every pull request review MUST verify compliance with these principles; any
  deviation MUST be written down with its justification and approved by the owner.

**Version**: 1.0.0 | **Ratified**: 2026-11-09 | **Last Amended**: 2026-11-09
