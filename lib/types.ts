// ─── Stream event types (mirrors source/lib/fastapi/schema.py StreamTypeEnum) ─

/** Sole product default; backend requests must always include the selected model. */
export const DEFAULT_MODEL = 'gpt-5.1';

/**
 * String-keyed constant object — the TypeScript equivalent of Python's StrEnum.
 * Values are plain strings so they survive JSON serialisation and switch narrowing.
 */
export const StreamTypeEnum = {
  TEXT: 'text',
  REASONING: 'reasoning',
  FUNC_CALL_START: 'function_call_start',
  FUNC_CALL_END: 'function_call_end',
  UI: 'ui',
  INTERACTIVE: 'interactive',
  MONITOR: 'monitor',
  ERROR: 'error',
} as const;

/** Union of all valid stream type strings, derived from StreamTypeEnum. */
export type StreamType = (typeof StreamTypeEnum)[keyof typeof StreamTypeEnum];

/** Raw NDJSON line emitted by the FastAPI /api/chat/stream endpoint. */
export interface StreamEvent {
  type: StreamType;
  content: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

// ─── Per-message part types ───────────────────────────────────────────────────

export type TextPart        = { type: typeof StreamTypeEnum.TEXT;           text: string };
export type ReasoningPart   = { type: typeof StreamTypeEnum.REASONING;      text: string };

/** Keyed by stringified index ("0", "1", …). Each value is a LangChain tool_call dict. */
export type FuncCallStartPart = { type: typeof StreamTypeEnum.FUNC_CALL_START; calls: Record<string, unknown> };

/** Mirrors ToolContext fields sent in FUNC_CALL_END events. */
export type FuncCallEndPart = {
  type: typeof StreamTypeEnum.FUNC_CALL_END;
  tool_call_id: string;
  name: string;
  status: 'success' | 'error';
  content: unknown;
};

export type UIPart          = { type: typeof StreamTypeEnum.UI;          artifact: Record<string, unknown> };
export type InteractivePart = { type: typeof StreamTypeEnum.INTERACTIVE; artifact: Record<string, unknown> };

/** Token usage metadata from LangChain AIMessage.usage_metadata. */
export type MonitorPart = { type: typeof StreamTypeEnum.MONITOR; usage: Record<string, unknown> };
export type ErrorPart   = { type: typeof StreamTypeEnum.ERROR;   message: string };

export type MessagePart =
  | TextPart
  | ReasoningPart
  | FuncCallStartPart
  | FuncCallEndPart
  | UIPart
  | InteractivePart
  | MonitorPart
  | ErrorPart;

// ─── Chat message ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
}
