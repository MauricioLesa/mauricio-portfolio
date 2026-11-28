<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Secrets: never read local env files

Do not read, print, search, copy or edit `.env`, `.env.local` or any other `.env*` file except `.env.example`, and do not print environment variables (`env`, `printenv`, `$env:...`). They hold real secrets such as the Anthropic API key. If a task needs a setting from them, ask Mauricio for the variable name and let him set the value himself. `.claude/settings.json` enforces this for Claude Code.
