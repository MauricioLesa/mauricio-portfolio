# Contract: HTTP API (route handlers)

Every handler follows the same shape: **parse with zod → call one `src/server` function → map the
result to HTTP**. Handlers contain no business logic, so the same functions can later sit behind a
separate API unchanged.

CloudFront sends `/api/*` to Lambda **with caching off**. All responses include
`Cache-Control: no-store`.

---

## POST `/api/chat`

Sends one visitor message and streams the answer and its trace.

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

**Response** `200 text/event-stream`. Events arrive in this order:

| Event | Data | When |
|---|---|---|
| `meta` | `{ conversationId, turnId, remainingMessages }` | First |
| `retrieval` | `{ passages: { passageId, source: { docType, docId, section, title }, score, excerpt }[] }` | After retrieval, before any text |
| `delta` | `{ text }` | Repeated while the answer streams |
| `done` | `{ outcome: "answered" \| "refused" \| "blocked", citations: passageId[], model, usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }, costUsd, costBreakdownUsd: { chat, retrieval }, truncated, latencyMs: { firstToken, retrieval, total } }` | Last, on success |
| `error` | `{ code, message, retryable }` | Last, on failure after the stream has started |

If `blocked`, the `done` event carries `replacementText`. The client replaces the partial answer
with it.

**Responses without a stream** (JSON body `{ code, message, retryAfterSeconds? }`):

| Status | `code` | Meaning |
|---|---|---|
| 400 | `invalid_request` | zod validation failed (empty, too long, bad UUID). No model call. |
| 404 | `conversation_not_found` | Unknown or expired `conversationId`. The client starts a new conversation. |
| 409 | `conversation_closed` | The 10-message limit was reached (FR-031). |
| 429 | `rate_limited` | 20 messages/hour per visitor (FR-020). Includes `retryAfterSeconds`. |
| 503 | `assistant_unavailable` | The daily or monthly spending cap was reached (FR-021). Includes `retryAfterSeconds` until the cap resets. |

**Timeouts**: if no `delta` arrives within 15 s, the server sends
`error { code: "provider_timeout", retryable: true }` (spec edge case).

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
