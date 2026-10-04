// ─── Stream event types (mirrors source/lib/fastapi/schema.py StreamTypeEnum) ─

/** Sole product default; backend requests must always include the selected model. */
export const DEFAULT_MODEL = 'gpt-6-luna';

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
  status?: MessageStatus;
}

// ─── Conversation and history API contracts ─────────────────────────────────

export type MessageStatus = 'completed' | 'streaming' | 'interrupted' | 'failed';
export type RunStatus = 'running' | 'completed' | 'interrupted' | 'failed';

export interface RunStatusResponse {
  run_id: string;
  status: RunStatus;
  cancel_requested: boolean;
}

export interface ModelPricing {
  currency: string;
  pricing_unit_tokens: number;
  long_context_threshold: number;
  input_price: number;
  cached_input_price: number;
  cache_write_price: number | null;
  output_price: number;
  long_input_price: number;
  long_cached_input_price: number;
  long_cache_write_price: number | null;
  long_output_price: number;
}

export interface ModelsResponse {
  models: string[];
  context_windows: Record<string, number>;
  pricing: Record<string, ModelPricing | null>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  run_status: RunStatus | null;
  active_run_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
}

export interface ConversationPage {
  conversations: ConversationSummary[];
  next_cursor: string | null;
}

export interface StoredMessagePart {
  id: string;
  position: number;
  type: StreamType;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  ordinal: number;
  status: MessageStatus;
  parts: StoredMessagePart[];
  created_at: string;
  updated_at: string;
}

export interface ConversationUsage {
  conversation_id: string; invocations: number; input_tokens: number; cached_input_tokens: number; cache_write_tokens: number; output_tokens: number; total_tokens: number; estimated_cost_usd: number | null; latest_input_tokens: number; latest_model: string | null;
}

export interface ConversationHistory {
  conversation: ConversationSummary;
  messages: StoredMessage[];
  truncated: boolean;
}
