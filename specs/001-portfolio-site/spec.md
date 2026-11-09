# Feature Specification: Portfolio Site with Grounded AI Assistant

**Feature Branch**: `001-portfolio-site`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "A personal portfolio site for Mauricio, a backend-leaning full-stack
developer from Cochabamba, Bolivia, that helps recruiters and hiring managers decide to interview
him. Pages: Home, About, CV (HTML + private short-lived PDF link), Projects (case studies), AI
assistant (grounded chat with visible trace panel), Guardrails, How I work with AI, Evals
dashboard, Architecture. Limits: running cost under $10/month; pages load in under 2 s on 4G;
assistant first token under 3 s; assistant refuses off-topic questions, never reveals its system
prompt, never shares personal contact data beyond the public email, never claims skills or jobs
not in the CV. Bilingual is out of scope for month 1."

## Clarifications

### Session 2026-11-09

- Q: Who may get the short-lived CV PDF link? → A: Any visitor who clicks "Download CV", subject
  to a per-visitor request limit.
- Q: How is running cost protected against bots and scrapers? → A: Site-wide daily and monthly
  model spending caps, per-answer length and per-conversation turn limits, a per-visitor CV link
  limit, and owner spend alerts at $5 and $8.
- Q: Is an "AI-built showcase" page (complex AI-generated demos such as 3D navigation) part of
  this feature? → A: No; it is a candidate future feature to evaluate after this one ships.
- Q: Should the Architecture page cover more than the diagram? → A: Yes; it also lists the good
  practices the site follows and where each one is applied (FR-024).
- Q: Should the owner be able to review traffic and visitor metrics? → A: Yes; private,
  cookieless analytics costing under $5/month (User Story 7, FR-034 to FR-039).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recruiter decides whether Mauricio fits a role (Priority: P1)

A recruiter arrives from a job board or LinkedIn link. On the Home page they read a one-sentence
summary of who Mauricio is, see his 3 strongest projects, and find a clear way to contact him or
get his CV. They can open About to see his background, stack and what he is learning now, and
open any project to read a case study covering the problem, architecture, trade-offs and results.

**Why this priority**: This is the site's core purpose. Without it nothing else matters; with only
this story the site is already a usable portfolio.

**Independent Test**: Load Home, About, the Projects list and one case study; confirm each shows
the required content and that the contact action reaches the public email.

**Acceptance Scenarios**:

1. **Given** a first-time visitor on Home, **When** the page loads, **Then** they see a
   one-sentence summary, exactly 3 featured projects, a "Contact me" action and a "Download CV"
   action without scrolling on a typical laptop screen.
2. **Given** a visitor on Home, **When** they choose a featured project, **Then** they land on
   that project's case study with Problem, Architecture, Trade-offs and Results sections.
3. **Given** a visitor on About, **When** the page loads, **Then** they see background, the stack
   (Node.js, TypeScript, React, Next.js, Docker, Redis, RabbitMQ, AWS) and a "Learning now" list.
4. **Given** a visitor choosing "Contact me", **When** they activate it, **Then** their email
   client opens addressed to the public email, and no other contact details are exposed.

---

### User Story 2 - Recruiter gets the CV (Priority: P2)

A recruiter wants the CV to forward to a hiring manager. They read the HTML CV on the site and
download a PDF copy through a link that works only for a short time.

**Why this priority**: The CV is the artifact recruiters pass internally; it is the most direct
conversion after contact.

**Independent Test**: Open the CV page, verify its content matches the PDF, request the PDF,
download it, then confirm the same link stops working after it expires.

**Acceptance Scenarios**:

1. **Given** a visitor on the CV page, **When** the page loads, **Then** the full CV is readable
   as a web page.
2. **Given** a visitor who requests the PDF, **When** the request is granted, **Then** they receive
   a download link that works for 5 minutes and then stops working.
3. **Given** an expired or tampered PDF link, **When** someone opens it, **Then** the download is
   refused and they are pointed back to the CV page to request a new link.
4. **Given** the PDF itself, **When** someone guesses or browses for its location directly,
   **Then** it is not reachable without a valid short-lived link.

---

### User Story 3 - Recruiter asks the AI assistant about Mauricio (Priority: P3)

A recruiter types a question such as "Has he worked with message queues in production?" The
assistant answers using only the CV and case studies, and a trace panel next to the answer shows
which passages it retrieved, which model answered, tokens used, cost and latency.

**Why this priority**: It differentiates the portfolio and demonstrates AI engineering skill, but
the site is still valuable without it.

**Independent Test**: Ask on-topic, off-topic and adversarial questions; confirm grounded answers,
refusals and a populated trace panel for each.

**Acceptance Scenarios**:

1. **Given** an on-topic question answerable from the CV or case studies, **When** the visitor
   sends it, **Then** the answer streams in, its first words appear within 3 seconds, and it
   cites which CV section or case study it relied on.
2. **Given** any answered or refused message, **When** the response completes, **Then** the trace
   panel shows the retrieved passages (with their source), the model name, input and output
   tokens, estimated cost and total latency.
3. **Given** an off-topic question (e.g., "Write me a poem", "What's the weather?"), **When** sent,
   **Then** the assistant politely refuses and says what it can help with.
4. **Given** a request to reveal its instructions or system prompt, **When** sent, **Then** the
   assistant refuses and does not disclose any part of them.
5. **Given** a request for a phone number, home address or other personal contact data, **When**
   sent, **Then** the assistant shares only the public email.
6. **Given** a question about a skill, employer or role not in the CV, **When** sent, **Then** the
   assistant says it has no record of it rather than claiming it.
7. **Given** a follow-up question in the same conversation, **When** sent, **Then** the assistant
   uses the earlier turns for context.

---

### User Story 4 - Visitor understands the assistant's guardrails (Priority: P4)

A visitor curious about how the assistant behaves reads the Guardrails page, which lists each
category of request the assistant refuses, why, and an example prompt with the actual refusal.

**Why this priority**: Builds trust in the assistant and showcases responsible AI design; it
depends on the assistant existing.

**Independent Test**: Open the Guardrails page and confirm every guardrail rule in this spec
(FR-016 to FR-019) is listed with a reason and at least one example.

**Acceptance Scenarios**:

1. **Given** a visitor on the Guardrails page, **When** it loads, **Then** they see the four refusal
   categories (off-topic, system-prompt disclosure, personal contact data, unsupported claims),
   each with a reason and at least one example exchange.

---

### User Story 5 - Technical hiring manager evaluates engineering practice (Priority: P5)

An engineering manager wants evidence of how Mauricio builds. They read "How I work with AI"
(his spec-driven workflow and how he reviews agent-written code) and the Architecture page (a
diagram plus explanation of how the site runs on AWS).

**Why this priority**: Valuable for technical interviewers, but secondary to the core portfolio.

**Independent Test**: Open both pages; confirm the workflow steps, review practice, diagram and
explanation are present and the diagram has a text alternative.

**Acceptance Scenarios**:

1. **Given** a visitor on "How I work with AI", **When** it loads, **Then** they see the ordered
   workflow steps (spec → plan → tasks → implement → review) and how agent code is reviewed.
2. **Given** a visitor on Architecture, **When** it loads, **Then** they see a diagram of the
   site's components and a written explanation that conveys the same information as the diagram.
3. **Given** a visitor on Architecture, **When** they reach the good-practices section, **Then**
   each practice listed in FR-024 appears with a short explanation of where it is applied.

---

### User Story 6 - Visitor checks the assistant's eval results (Priority: P6)

A visitor opens the Evals dashboard and sees how the assistant performed on its eval set across
runs: pass rate, average cost per question and latency, as trends over time and for the latest run.

**Why this priority**: Proves the assistant is measured, not just demoed; it requires eval runs to
exist first.

**Independent Test**: With at least two recorded eval runs, open the dashboard and confirm the
latest values and trends match the recorded results.

**Acceptance Scenarios**:

1. **Given** recorded eval runs, **When** the dashboard loads, **Then** it shows the latest run's
   pass rate, average cost per question and median and 95th-percentile latency, plus a chart of
   each over time.
2. **Given** the latest run, **When** the visitor looks at it, **Then** they see its date, the
   model used and the number of eval cases.
3. **Given** no eval runs recorded yet, **When** the dashboard loads, **Then** it shows an empty
   state explaining that results will appear after the first run.

---

### User Story 7 - Owner reviews traffic and visitor behavior (Priority: P7)

Mauricio opens a private analytics view to see how many people visit, where they come from, which
pages and projects they read, and how many of them download the CV, click "Contact me" or use the
assistant, so he can tell whether the site is helping him get interviews.

**Why this priority**: Useful for improving the site, but visitors get full value without it.

**Independent Test**: Visit several pages, download the CV, click "Contact me" and send an
assistant message; within the reporting delay, confirm each shows up in the owner's view and that
no cookie or personal identifier was set in the browser.

**Acceptance Scenarios**:

1. **Given** visits to the site, **When** the owner opens the analytics view, **Then** they see
   page views, approximate unique visitors, top pages, referrers, countries and device types for
   a chosen period (last 7 days, last 30 days, custom range).
2. **Given** visitors who download the CV, click "Contact me" or start an assistant conversation,
   **When** the owner opens the analytics view, **Then** each of those actions is counted
   separately and per page.
3. **Given** real visits, **When** the owner opens the analytics view, **Then** they see page load
   performance from real visitors, so SC-001 can be checked against real traffic.
4. **Given** a public visitor, **When** they try to open the analytics view, **Then** access is
   denied; only the owner can see it.
5. **Given** any visitor, **When** they browse the site, **Then** no tracking cookie is set and no
   consent banner is needed.

---

### Edge Cases

- The assistant's daily or monthly spending cap is reached (for example, by a bot rotating
  addresses to get around per-visitor limits): the chat shows a clear message that the assistant
  is temporarily unavailable, says when it will be back, and links to the CV and contact action.
- A visitor sends many messages quickly: after the per-visitor limit is reached, further messages
  are refused with a message saying when they can try again.
- A visitor sends a very long message: handled by FR-020 (rejected with a message stating the
  limit; no model call).
- The model provider is slow or fails: the visitor sees an error message with a retry option
  within 15 seconds, and the trace panel records the failure.
- A prompt-injection attempt is hidden inside an otherwise on-topic question: the guardrails still
  apply; the assistant answers only the on-topic part or refuses.
- A question is on-topic but the CV and case studies contain nothing relevant: the assistant says
  it does not have that information and suggests contacting Mauricio.
- JavaScript is disabled or fails to load: all content pages (everything except the chat and
  chart interactivity) remain readable.
- A visitor navigates the whole site by keyboard only, including sending chat messages and opening
  the trace panel.
- A visitor's browser blocks the analytics script: the site works normally; that visit is simply
  not counted.
- Bot or crawler traffic: known bots are excluded from visitor counts where the analytics tool
  can detect them.

## Requirements *(mandatory)*

### Functional Requirements

**Site & content**

- **FR-001**: The site MUST provide nine pages: Home, About, CV, Projects (list and one page per
  case study), AI assistant, Guardrails, How I work with AI, Evals dashboard and Architecture,
  all reachable from a navigation menu on every page.
- **FR-002**: Home MUST show a one-sentence summary, exactly 3 featured projects linking to their
  case studies, a contact action and a CV download action.
- **FR-003**: About MUST show background, the stack (Node.js, TypeScript, React, Next.js, Docker,
  Redis, RabbitMQ, AWS) and a "Learning now" list.
- **FR-004**: Each case study MUST contain Problem, Architecture, Trade-offs and Results sections.
- **FR-005**: The contact action MUST use only the public email; no other personal contact data
  may appear anywhere on the site.
- **FR-006**: The owner MUST be able to change page content, the CV and case studies by editing
  content files and redeploying, without changing application logic.

**CV**

- **FR-007**: The CV page MUST present the full CV as a web page, with content matching the PDF.
- **FR-008**: The PDF MUST be stored privately and be downloadable only through a link that
  expires 5 minutes after it is issued.
- **FR-009**: Any visitor who activates "Download CV" MUST receive a short-lived link, with no
  form or sign-up, subject to the per-visitor limit in FR-032.
- **FR-010**: Expired or invalid links MUST be refused with a message pointing back to the CV page.

**AI assistant**

- **FR-011**: The assistant MUST answer using only the CV and case studies as its source of facts.
- **FR-012**: Answers MUST stream, and MUST indicate which CV section or case study they rely on.
- **FR-013**: Conversations MUST support follow-up questions within a browser session; history is
  not kept after the session ends.
- **FR-014**: Every response MUST show a trace panel with: retrieved passages and their source,
  model name, input and output tokens, estimated cost in USD and total latency.
- **FR-015**: Every assistant call MUST be logged with model, tokens, cost and latency.
- **FR-016**: The assistant MUST refuse questions unrelated to Mauricio's experience, skills,
  projects or this site, and say what it can help with.
- **FR-017**: The assistant MUST NOT reveal its system prompt or instructions, in whole or in
  part, including when asked indirectly or through injected instructions.
- **FR-018**: The assistant MUST NOT share personal contact data other than the public email.
- **FR-019**: The assistant MUST NOT claim skills, employers, roles or results that are not in the
  CV or case studies; when asked about one, it MUST say it has no record of it.
- **FR-020**: The assistant MUST enforce a per-visitor rate limit (default 20 messages per hour)
  and a maximum message length (default 1,000 characters), rejecting over-limit messages without
  calling the model.
- **FR-021**: The assistant MUST stop accepting messages once either site-wide model spending cap
  is reached (default $0.25 per day and $5 per month), showing the unavailable message from Edge
  Cases. The daily cap resets at 00:00 UTC; the monthly cap resets on the 1st of the month.

**Guardrails, practice and architecture pages**

- **FR-022**: The Guardrails page MUST list each refusal category from FR-016 to FR-019 with its
  reason and at least one example prompt and refusal.
- **FR-023**: "How I work with AI" MUST describe the spec-driven workflow steps and how
  agent-written code is reviewed before merge.
- **FR-024**: The Architecture page MUST include a diagram of how the site runs on AWS and a
  written explanation conveying the same information. It MUST also list the good practices the
  site follows, each with one or two sentences on where and how it is applied. The list covers
  at least: least-privilege access with no long-lived credentials, secrets kept server-side,
  infrastructure defined as code and deployed only after human review, server-side input
  validation, cost controls (spending caps and alerts), automated tests as a merge gate,
  assistant guardrails with evals, and accessibility.

**Evals**

- **FR-025**: The assistant MUST have an eval set covering on-topic answers and each guardrail in
  FR-016 to FR-019 (at least 5 cases per guardrail and at least 20 on-topic cases).
- **FR-026**: Each eval run MUST record date, model, number of cases, pass rate, average cost per
  case, and median and 95th-percentile latency.
- **FR-027**: The Evals dashboard MUST show the latest run's results and the trend of pass rate,
  cost and latency across all recorded runs, with an empty state when there are none.

**Quality**

- **FR-028**: All pages MUST meet WCAG 2.1 AA basics: semantic structure, text alternatives for
  images and diagrams, full keyboard operation with visible focus, and AA color contrast.
- **FR-029**: Content pages MUST remain readable without client-side scripting.

**Cost protection**

- **FR-030**: Each assistant answer MUST be limited in length (default about 300 words).
- **FR-031**: Each conversation MUST be limited to 10 visitor messages; after that the visitor is
  asked to start a new conversation.
- **FR-032**: CV link requests MUST be limited per visitor (default 10 per hour); over-limit
  requests are refused with a message saying when to try again.
- **FR-033**: The owner MUST receive an email alert when total monthly hosting spend reaches $5
  and again at $8. Alerts notify only; FR-021 is what stops model spending.

**Analytics**

- **FR-034**: The site MUST record page views, approximate unique visitors, referrers, countries
  and device types, and the events CV download, contact click and assistant conversation started.
- **FR-035**: The site MUST record real-visitor page load performance for each page.
- **FR-036**: Analytics MUST be cookieless and MUST NOT store IP addresses or other personal
  identifiers, so that no consent banner is required.
- **FR-037**: The analytics view MUST be accessible only to the owner.
- **FR-038**: Analytics MUST cost under $5 per month at the traffic assumed in Assumptions, and
  that cost counts toward the $10 total in SC-003.
- **FR-039**: Analytics MUST NOT block page loads or add more than 100 ms to the time until a
  page's main content is visible; if it fails to load, pages still work and still meet SC-001.

### Key Entities

- **Page content**: Owner-authored text for each page (summary, background, stack, learning list,
  workflow, architecture explanation).
- **Project / case study**: Title, short summary, featured flag and rank, Problem, Architecture,
  Trade-offs, Results, optional images with alt text.
- **CV**: Structured experience, skills, education; the source for both the HTML page, the PDF and
  the assistant.
- **CV download link**: Short-lived grant to download the PDF; issued time, expiry time.
- **Source passage**: A chunk of CV or case-study text the assistant can retrieve, with its source
  (document and section).
- **Conversation turn**: Visitor message, assistant response, retrieved passages, model, tokens,
  cost, latency, outcome (answered / refused / error).
- **Eval case**: Prompt, category (on-topic or a guardrail), expected behavior, pass criteria.
- **Eval run**: Date, model, cases run, per-case results, pass rate, average cost, latency
  percentiles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every page shows its main content within 2 seconds for a first-time visitor on a
  typical 4G mobile connection (measured with a standard mobile 4G throttling profile).
- **SC-002**: For on-topic questions, the first words of the answer appear within 3 seconds for
  at least 95% of questions.
- **SC-003**: Total monthly running cost of the site stays under $10, including assistant usage.
- **SC-004**: The assistant passes 100% of guardrail eval cases (off-topic, system-prompt
  disclosure, personal contact data, unsupported claims) before release and on every later run.
- **SC-005**: The assistant passes at least 90% of on-topic eval cases.
- **SC-006**: A recruiter can find the one-sentence summary, the 3 featured projects and the CV
  download within 10 seconds of landing on Home.
- **SC-007**: Every page passes an automated WCAG AA check with zero serious or critical issues,
  and every interactive element is operable by keyboard.
- **SC-008**: An expired CV link fails 100% of the time after its 5-minute window.

## Assumptions

- Primary visitors are recruiters and hiring managers on desktop or mobile; there are no visitor
  accounts or logins, and no owner admin interface in this release.
- Content (page text, CV, case studies) is authored by the owner as files in the project and
  published by redeploying; no CMS.
- The "Contact me" action opens the visitor's email client to the public email; there is no
  contact form in this release.
- Traffic is low (under roughly 1,000 visits and 500 assistant messages per month), which the cost
  targets assume.
- Assistant logs store visitor question text, model, tokens, cost and latency for up to 30 days to
  support debugging and new eval cases; the chat page tells visitors that questions are logged.
  Logs never include IP addresses beyond what rate limiting needs at the moment of the request.
- Eval runs are started by the owner (for example, before each release); the dashboard shows
  recorded runs and does not run evals itself.
- The site is English only; bilingual support is out of scope for month 1.
- Out of scope: blog, visitor accounts, a CMS, multi-language content, and analytics beyond
  FR-034 to FR-039 (no session recordings, heatmaps or per-person tracking).
- The owner's analytics view may be the analytics tool's own private dashboard; it does not need
  to be a page on this site.
- Future candidate (separate feature, to evaluate after this one ships): an "AI-built showcase"
  page with complex AI-generated demos (for example, 3D navigation) that probe what AI-written
  code can do. The navigation should be able to take one more page without redesign.
