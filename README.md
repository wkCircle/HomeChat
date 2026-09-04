# Home Agent — Frontend (HomeChat)

A Next.js chat UI with durable, user-owned conversations streamed from the Home Agent FastAPI
backend.

This app uses a server-side reverse proxy at `app/api/[...path]/route.ts` so the browser always calls the UI origin (`/api/...`). The proxy forwards to the backend using a runtime environment variable, which means you don’t need client-side `NEXT_PUBLIC_*` variables.

---

## Project Layout

```
HomeChat/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── api/[...path]/route.ts   # reverse proxy to backend (runtime)
├── components/
│   ├── ArtifactRenderer.tsx
│   ├── MessageList.tsx
│   └── SettingsPanel.tsx
├── lib/
│   ├── api.ts                    # uses relative /api paths
│   ├── types.ts
│   └── useChat.ts                # NDJSON stream handling
├── public/
├── next.config.ts                # no build-time API rewrites
├── package.json
└── Dockerfile
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
| `interactive` | Resolved interactive artifact | `artifact` |
| `monitor` | LLM token usage metadata | `input_tokens`, `output_tokens`, `total_tokens` |
| `error` | Error emitted by the backend | error detail |

### Request body

```json
{
  "message": "your question",
  "model": "gpt-5.1",
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
Each `ChatMessage` holds a `parts` array instead of a single string. This maps naturally to the multi-type stream — a single assistant turn can contain reasoning blocks, tool call steps, UI artifacts, and text, all rendered in order.

### Extensible artifact rendering
`ui` and `interactive` parts are restored from persisted history through the same reducer used for
live stream events. `ArtifactRenderer` renders Plotly charts and structured tables, including
responsive overflow controls for narrow viewports.

### Conversation and run management
HomeAI creates each conversation UUID and uses it as the LangGraph `thread_id`. `useChat` keeps
separate message caches and stream controllers by conversation, so selecting another conversation
does not abort an active producer. Conversation list/history endpoints restore persisted status and
rendered output after reload. The stream response exposes `X-Run-ID`; Stop sends the owner-scoped
run request, waits for interruption to settle, and retains already-persisted partial output.

The model selector belongs to the composer, not stored conversation metadata. HomeChat sends the
current model explicitly with every run and does not change the selection when switching
conversations.
