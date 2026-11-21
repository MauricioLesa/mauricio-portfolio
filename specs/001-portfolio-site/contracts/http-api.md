# Contract: HTTP API (route handlers)

Every handler follows the same shape: **parse with zod → call one `src/server` function → map the
result to HTTP**. Handlers contain no business logic, so the same functions can later sit behind a
separate API unchanged.

CloudFront sends `/api/*` to Lambda **with caching off**. All responses include
`Cache-Control: no-store`.

---

## POST `/api/chat`

Sends one visitor message and streams the tool steps, the answer and its trace (amended
2026-11-21: `step` events replace the `retrieval` event).

**Request headers**

- `Content-Type: application/json`
- `x-amz-content-sha256: <hex SHA-256 of body>`. CloudFront OAC needs this for POST to the
  function URL; see research R1b. The chat client computes it with Web Crypto.

**Request body** (zod `ChatRequest`)

```ts
{
  conversationId?: string   // UUID returned by an earlier response; omit to start a conversation
  message: string           // trimmed, 1–1,000 characters (FR-020)
}
```

**Response** `200 text/event-stream` (Server-Sent Events). Events arrive in this order:

| Event | Data | When |
|---|---|---|
| `meta` | `{ conversationId, turnId, remainingMessages }` | First |
| `step` | `{ round, tool: "list_projects" \| "get_project" \| "get_profile", input, isError }` | Once per tool call, right after it runs (at most 4 rounds) |
| `delta` | `{ text }` | Repeated while the model writes text (mostly the final answer) |
| `done` | `{ outcome: "answered" \| "refused" \| "blocked" \| "incomplete", answer?, citations: { ref, label }[], trace: { model, rounds, modelCalls, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, costUsd, truncated, latencyMs: { firstToken, total, model, tools } } }` | Last, on success |
| `error` | `{ code, message, retryable }` | Last, on failure after the stream has started |

If `blocked` or `incomplete`, `done` carries `answer` (the replacement or fixed text), and the
client replaces any partial answer with it. A citation looks like
`{ ref: "project:code-migration", label: "Case study: Code migration" }`.

**Responses without a stream** (JSON body `{ code, message, retryAfterSeconds? }`):

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | zod validation failed (empty, too long, bad UUID). No model call. |
| 404 | `conversation_not_found` | Unknown or expired `conversationId`. The client starts a new conversation. |
| 409 | `conversation_closed` | The 10-message limit was reached (FR-031). |
| 429 | `rate_limited` | 20 messages/hour per visitor (FR-020). Includes `retryAfterSeconds`. |
| 503 | `assistant_unavailable` | The daily or monthly spending cap was reached (FR-021). Includes `retryAfterSeconds` until the cap resets. |

**Timeouts**: each model call has a 15 s timeout and the whole turn 25 s. On a timeout the server
sends `error { code: "provider_timeout", retryable: true }`; a Bedrock failure after the SDK's
retries sends `error { code: "provider_error", retryable: true }` (spec edge case).

---

## GET `/api/cv/link`

Issues a short-lived CV link (FR-008, FR-009, FR-032).

- `303 See Other` with `Location: /api/cv/file/{grantId}`. The grant expires in 5 minutes.
- Rate-limited: `303` to the static page `/cv/too-many-requests` (HTML flow; no JavaScript needed).

## GET `/api/cv/file/{grantId}`

`grantId` is validated with zod (32 hex characters).

- If the grant is valid: `302` to an S3 presigned GET URL (60 s, `attachment; filename=cv.pdf`).
- If the grant is expired, unknown or malformed: `302` to the static page `/cv/link-expired` (FR-010).

---

## Analytics events (client → Umami, not our API)

| Event name | Properties | Trigger |
|---|---|---|
| `cv-download` | `{ page }` | "Download CV" activated |
| `contact-click` | `{ page }` | "Contact me" activated |
| `chat-started` | none | First message of a conversation sent |
| `web-vital` | `{ name: "LCP" \| "INP" \| "CLS" \| "FCP" \| "TTFB", value, page }` | Next.js `useReportWebVitals` |

The properties never contain message text or visitor identifiers (FR-036).
