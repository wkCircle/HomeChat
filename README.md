# Home Agent â€” Frontend (HomeChat)

A Next.js chat UI with durable, user-owned conversations streamed from the Home Agent FastAPI
backend.

This app uses a server-side reverse proxy at `app/api/[...path]/route.ts` so the browser always calls the UI origin (`/api/...`). The proxy forwards to the backend using a runtime environment variable, which means you donâ€™t need client-side `NEXT_PUBLIC_*` variables.

---

## Project Layout

```
HomeChat/
â”œâ”€â”€ app/
â”‚   â”œâ”€â”€ globals.css
â”‚   â”œâ”€â”€ layout.tsx
â”‚   â”œâ”€â”€ page.tsx
â”‚   â””â”€â”€ api/[...path]/route.ts   # reverse proxy to backend (runtime)
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ ArtifactRenderer.tsx
â”‚   â”œâ”€â”€ MessageList.tsx
â”‚   â””â”€â”€ SettingsPanel.tsx
â”œâ”€â”€ lib/
â”‚   â”œâ”€â”€ api.ts                    # uses relative /api paths
â”‚   â”œâ”€â”€ types.ts
â”‚   â””â”€â”€ useChat.ts                # NDJSON stream handling
â”œâ”€â”€ public/
â”œâ”€â”€ next.config.ts                # no build-time API rewrites
â”œâ”€â”€ package.json
â””â”€â”€ Dockerfile
```

---

## Local Development

1) Install deps

```bash
npm install
```

2) Start dev server

```bash
npm run dev
```

Open http://localhost:3000. By default, the proxy will try `http://localhost:8010` if no runtime env is provided.

---

## Testing

Run all TypeScript and TSX unit tests once:

```bash
npm test
```

Run a specific test file:

```bash
npm test -- lib/conversations.test.ts
npm test -- components/ConversationSidebar.test.tsx
```

Run tests in watch mode while developing:

```bash
npm test -- --watch
```

Tests are run with Vitest. Unit tests are colocated with their source files using the
`.test.ts` or `.test.tsx` suffix; shared test setup lives under `tests/`.

Before release, also verify the sidebar at desktop and mobile widths, including its overlay,
focus behavior, collapse preference, long conversation titles, chart/table overflow, and the
composer controls. Then run the production build.

---

## Settings and chat tools

- The header gear opens **General** (theme/font size) and **Tools** (default tool choices).
  Confirmed settings are stored by the backend for the current user, not only in this browser.
- The composer's bottom-left **Tools** button controls the current chat. New chats copy current
  defaults; explicit chat choices, including off, survive later default changes and chat reuse.
  Legacy chats without an explicit choice inherit the user default, otherwise off.
- Changes are shown after a successful save. Send waits for pending settings writes; failures
  retain confirmed values and show a retry action. Changing tools does not change the model
  or interrupt an active response. Backend run settings are captured for the next prompt.
- **Activation remains gated pending live provider/release acceptance.** Search execution,
  citation persistence/previews and cost accounting are implemented and tested offline. The temporary
  backend rollout allowlist remains empty; both panels still disclose that search is not active.

The UI uses the existing same-origin authenticated settings, tool catalog, and conversation APIs.
No additional frontend environment variables, dependencies, or SQL changes are needed for these
controls. The backend preferences migration must already be deployed when using PostgreSQL.

Before acceptance, run `npm run build` and verify at desktop/mobile widths: open General/Tools,
change theme/font/defaults, set a chat override, switch chats and reload, and confirm explicit off
survives a global default change. Also verify model/usage/Send/Stop and keyboard focus still work.


### Native citations and search cost

Native text events may have a stable `part_id`. Repeated events with that ID are full snapshots,
not text deltas: the hook updates the existing part in place, including late source/citation data.
Legacy text-only streams still append normally. Restored and interrupted answers use the same path.
Citation ranges are Unicode code points in the decoded Markdown/HTML source, not UTF-16 indices.

After HTML sanitization, verified references become grouped hostname/favicon pills. Hover/focus or
500 ms touch hold opens an interactive, viewport-clamped source dialog; normal touch is usable,
movement/scroll cancels a pending hold, and outside/Escape closes it. Source titles/dates only appear
when provided; ordinary links and code remain unchanged. Model previews reuse the shared hook.

Favicons use the authenticated, owner/source-ID backend endpoint through the existing same-origin
proxy. No arbitrary URL or third-party favicon request is sent from the browser; unavailable images
use a local globe. The proxy preserves binary data and the backend's safe cache/CSP/nosniff headers.
The backend discovers bounded public-homepage icon links and validates/pins public HTTPS targets at
every redirect/CDN hop; scripts and SVG are not executed. It never forwards chat text, the original
citation path/query, cookies, authorization or Referer. Target sites still see the backend IP and
public icon requests. Icons are temporary memory-cache entries, not stored chat assets: replay may
refetch them, and a disappeared icon leaves the source link usable with the globe fallback.

The usage dialog separates **Model token cost**, observed completed searches and native/context
charges. **Web searches** accumulates completed search actions across all turns, excluding page opens
and find-in-page actions. Three actual searches followed by four show seven, not four. A small
circled info button beside **Web searches** explains search-call fees versus open/find actions and
separate model-token charges on hover, keyboard focus or tap. With the info button focused, Escape
dismisses the tooltip before the usage panel. Token counts remain visible independently of pricing. Missing prices, interrupted work or
unknown search-token attribution show an incomplete estimate, not free work. The optional
`estimated_search_call_cost_usd` subtotal displays known call fees excluding unresolved context.
When the complete charge is unknown, the main row is labeled **Search call fees** and shows that
subtotal; when the complete tool charge is known, it remains **Search charges**. No partial fee is
presented as the session total. One concise yellow notice lists the remaining unknowns. An empty model-pricing catalog needs backend configuration
or reviewed database pricing setup, not a different model allowlist format. Totals include the
existing title/chat/compaction semantics. Live OpenAI billing attribution and the final rollout gate
are tracked in the backend web-search implementation plan.

Hosted search uses the existing grey start and green/red result boxes when tool-call display is
on. Headers distinguish `web_search (search)`, `web_search (open page)` and
`web_search (find in page)` so not every hosted-tool card is mistaken for a billable search.
Matching provider-response/call IDs prevent duplicate cards at final graph updates; persisted
parts use the existing replay path. Cards show bounded exposed queries/actions and source metadata,
not raw search/page bodies. The installed backend LangChain adapter forwards completed hosted-tool
items but drops raw start/searching SSE events: currently cards normally first appear at completion,
before the following answer, rather than indicating the exact search-start instant. No search is
claimed just because the toggle is on. Old messages cannot gain cards retroactively from billing
records, which deliberately omit queries. The backend no longer requests the optional exhaustive
source inventory because weather API sources exceed the current SDK's URL-only schema; this does
not disable answer URL citations, search actions or tool-result cards. Cards display only sources
actually supplied by the provider and never invent a URL for an API/weather source.

Before acceptance, build and test desktop/mobile citation hover, focus, long-hold, outside/Escape,
long hostnames, grouped sources, sanitized HTML, ordinary links/code, Stop/reload and cost examples.

---

## Production Build

```bash
npm run build
npm run start
```

When running in Docker (recommended), the proxy reads `BACKEND_INTERNAL_URL` at runtime from `docker-compose.yml` and forwards to the backend (for example `http://home_ai:8010`).

---

## Configuration

- Backend target (runtime): set `BACKEND_INTERNAL_URL` in your Compose for the `home_chat` service, e.g. `http://home_ai:8010`.
- No client env needed: `NEXT_PUBLIC_BACKEND_URL` is not used.
- Logs: reverse proxy logs network errors to stdout/stderr (visible via `docker logs home_chat`).

Optional local override: you can still create `.env.local` for other Next.js settings, but it is not required for the backend URL.

---

## Backend Contract

The frontend consumes the `/api/chat/stream` endpoint (POST), which returns an **NDJSON stream** (`application/x-ndjson`). Each line is a JSON object:

```json
{"type": "<event_type>", "content": {...}, "metadata": {...}}
```

### Supported event types

| `type` | Description | Key `content` fields |
|---|---|---|
| `text` | Streamed text token from the LLM | `text` |
| `reasoning` | LLM reasoning/thinking block | `text` |
| `function_call_start` | Tool calls dispatched by the LLM | indexed dict of tool call objects |
| `function_call_end` | Tool call result returned to the LLM | `tool_call_id`, `name`, `status`, `content` |
| `ui` | Resolved UI artifact (e.g. chart, table) | `artifact` |
| `monitor` | LLM token usage metadata | `input_tokens`, `output_tokens`, `total_tokens` |
| `error` | Error emitted by the backend | error detail |

### Request body

```json
{
  "message": "your question",
  "model": "gpt-6-luna",
  "thread_id": "<uuid>",
  "kwargs": {
    "return_reasoning_info": true,
    "return_func_call_start_info": true,
    "return_func_call_end_info": true,
    "return_token_info": false
  }
}
```

---

## Key Design Decisions

### No Vercel AI SDK dependency
The streaming hook (`useChat.ts`) is ~100 lines of plain React + native `fetch`. The backend uses a **custom NDJSON protocol** (not OpenAI SSE format), so using the Vercel AI SDK would require an adapter of similar complexity with no benefit.

### NDJSON parsing
The `ReadableStream` from `fetch` is consumed with a `TextDecoder` in streaming mode. Chunks are accumulated into a line buffer and split on `\n`. Each complete line is parsed as JSON and routed by `type`.

### Text token coalescing
Consecutive `text` events are merged into a single `TextPart` in state rather than appending a new part per token. This avoids O(n) re-renders as the LLM streams long responses.

### Part-based message model
Each `ChatMessage` holds a `parts` array instead of a single string. This maps naturally to the multi-type stream â€” a single assistant turn can contain reasoning blocks, tool call steps, UI artifacts, and text, all rendered in order.

### Extensible artifact rendering
`ui` parts are restored from persisted history through the same reducer used for live stream
events. `ArtifactRenderer` renders JSON Plotly charts and structured tables, including responsive
overflow controls for narrow viewports. Legacy inline-HTML and hosted-page chart artifacts are
blocked with an explicit warning; they are never injected into the page or loaded in an iframe.

Assistant text supports GitHub-Flavored Markdown, KaTeX, clickable Markdown/HTML links, and basic
sanitized HTML. Scripts, event handlers, iframes, and custom CSS are not supported. Fenced HTML
is displayed as code, not executed. The unused `interactive` block/event has been removed.

### Conversation and run management
HomeAI creates each conversation UUID and uses it as the LangGraph `thread_id`. `useChat` keeps
separate message caches and stream controllers by conversation, so selecting another conversation
does not abort an active producer. Conversation list/history endpoints restore persisted status and
rendered output after reload. After the first stream completes, HomeChat reloads the authoritative
history so HomeAI's AI-generated title replaces the temporary `New chat` label. The stream response
exposes `X-Run-ID`; Stop sends the owner-scoped run request, waits for interruption to settle, and
retains already-persisted partial output.

The selected conversation is reflected in the URL as `/chatbot?thread_id=<uuid>`. Refreshing or
opening a bookmark restores that conversation, even when it is outside the first sidebar page.
Selecting or creating a chat updates the URL without reloading or adding browser history entries;
deleting the selected chat updates it to the next selection (or removes `thread_id` if none remain).
Without a `thread_id`, the first sidebar conversation is selected as before. Unavailable or
unauthorized bookmarked conversations display the backend's history error rather than silently
opening a different chat. Access is still enforced by the backend; the URL is not authorization.

The model selector belongs to the composer, not stored conversation metadata. HomeChat sends the
current model explicitly with every run and does not change the selection when switching
conversations.
