# Home Agent — Frontend

A Next.js chat UI that streams responses from the Home Agent FastAPI backend.

---

## Folder Structure

```
front-end/
├── .env.local.example        # environment variable template
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── app/
│   ├── globals.css           # Tailwind base styles
│   ├── layout.tsx            # root layout (metadata, body wrapper)
│   └── page.tsx              # chat UI: header + scrollable message area + input
├── components/
│   └── MessageList.tsx       # renders all backend event types as message parts
└── lib/
    ├── types.ts              # TypeScript types mirroring source/lib/fastapi/schema.py
    └── useChat.ts        # core hook: fetch + NDJSON stream parser + chat state
```

---

## Getting Started

**1. Install dependencies**

```sh
cd front-end
npm install
```

**2. Configure the backend URL**

```sh
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8010
```

**3. Run the development server**

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

**4. Build for production**

```sh
npm run build
npm start
```

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
`ui` and `interactive` parts currently render the raw `artifact` JSON inside a `<details>` element. Replace the `ArtifactBlock` component in `components/MessageList.tsx` with your domain-specific renderer once the artifact shape is known.

### Thread management
Each `useChat` hook instance generates a stable `thread_id` (random string) on mount. Calling `reset()` clears messages and generates a new `thread_id`, starting a fresh conversation without reloading the page.
