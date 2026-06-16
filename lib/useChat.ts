'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import apiFetch from './api';
import { StreamTypeEnum } from './types';
import type { ChatMessage, MessagePart, StreamEvent } from './types';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface UseChatOptions {
  /** LLM model name. Defaults to gpt-5.1. */
  model?: string;
  /** Whether to request reasoning blocks from the backend. */
  returnReasoning?: boolean;
  /** Whether to request function call start/end blocks. */
  returnFuncCallInfo?: boolean;
}

export function useChat({
  model = 'gpt-5.1',
  returnReasoning = true,
  returnFuncCallInfo = true,
}: UseChatOptions = {}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // thread_id is stable for the lifetime of this hook instance (one conversation)
  const threadId = useRef<string>(randomId());
  const STORAGE_KEY = 'homechat:chat:messages';
  const STORAGE_THREAD_KEY = 'homechat:chat:threadId';

  // Hydrate from localStorage on first mount
  useEffect(() => {
    try {
      const rawMsgs = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const rawThread = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_THREAD_KEY) : null;
      if (rawThread) threadId.current = rawThread;
      if (rawMsgs) {
        const parsed = JSON.parse(rawMsgs) as ChatMessage[];
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch {
      // ignore corrupt storage
    }
  }, []);

  // Persist to localStorage on changes
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      localStorage.setItem(STORAGE_THREAD_KEY, threadId.current);
    } catch {
      // storage quota exceeded or forbidden — ignore silently for quick fix
    }
  }, [messages]);

  const append = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || isLoading) return;

      const userMsg: ChatMessage = {
        id: randomId(),
        role: 'user',
        parts: [{ type: 'text', text: userMessage }],
      };
      const assistantId = randomId();
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', parts: [] };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiFetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userMessage,
            model,
            thread_id: threadId.current,
            kwargs: {
              return_reasoning_info: returnReasoning,
              return_func_call_start_info: returnFuncCallInfo,
              return_func_call_end_info: returnFuncCallInfo,
              return_token_info: false,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = '';

        /**
         * Immutably updates the parts of the assistant message currently being streamed.
         * Called on every NDJSON event so the UI re-renders incrementally.
         */
        const updateParts = (updater: (prev: MessagePart[]) => MessagePart[]) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, parts: updater(m.parts) } : m)),
          );
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode chunk and split into lines (NDJSON = one JSON object per line)
          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split('\n');
          lineBuffer = lines.pop() ?? ''; // last element may be incomplete

          for (const line of lines) {
            if (!line.trim()) continue;

            let event: StreamEvent;
            try {
              event = JSON.parse(line) as StreamEvent;
            } catch {
              continue; // skip malformed lines
            }

            updateParts((parts) => routeEvent(parts, event));
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, parts: [...m.parts, { type: 'error', message: msg }] }
              : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, model, returnReasoning, returnFuncCallInfo],
  );

  /** Reset conversation — clears messages and generates a new thread_id. */
  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
    threadId.current = randomId();
    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_THREAD_KEY, threadId.current);
      }
    } catch {
      // ignore
    }
  }, []);

  return {
    messages,
    isLoading,
    error,
    append,
    reset,
    threadId: threadId.current,
  };
}

// ─── Event router ─────────────────────────────────────────────────────────────

/**
 * Maps a single StreamEvent onto the current parts array and returns the new array.
 * Pure function — no side effects.
 */
function routeEvent(parts: MessagePart[], event: StreamEvent): MessagePart[] {
  const c = event.content;

  switch (event.type) {
    case StreamTypeEnum.TEXT: {
      const incoming = (c['text'] as string) ?? '';
      if (!incoming) return parts;
      // Coalesce consecutive text tokens into a single TextPart for efficient rendering
      const last = parts[parts.length - 1];
      if (last?.type === StreamTypeEnum.TEXT) {
        return [...parts.slice(0, -1), { ...last, text: last.text + incoming }];
      }
      return [...parts, { type: StreamTypeEnum.TEXT, text: incoming }];
    }

    case StreamTypeEnum.REASONING: {
      const incoming = (c['text'] as string) ?? '';
      if (!incoming.trim()) return parts;
      // Coalesce consecutive reasoning tokens into a single ReasoningPart
      const last = parts[parts.length - 1];
      if (last?.type === StreamTypeEnum.REASONING) {
        return [...parts.slice(0, -1), { ...last, text: last.text + incoming }];
      }
      return [...parts, { type: StreamTypeEnum.REASONING, text: incoming }];
    }

    case StreamTypeEnum.FUNC_CALL_START:
      return [...parts, { type: StreamTypeEnum.FUNC_CALL_START, calls: c as Record<string, unknown> }];

    case StreamTypeEnum.FUNC_CALL_END:
      return [
        ...parts,
        {
          type: StreamTypeEnum.FUNC_CALL_END,
          tool_call_id: c['tool_call_id'] as string,
          name: c['name'] as string,
          status: c['status'] as 'success' | 'error',
          content: c['content'],
        },
      ];

    case StreamTypeEnum.UI:
      return [...parts, { type: StreamTypeEnum.UI, artifact: (c['artifact'] as Record<string, unknown>) ?? {} }];

    case StreamTypeEnum.INTERACTIVE:
      return [
        ...parts,
        { type: StreamTypeEnum.INTERACTIVE, artifact: (c['artifact'] as Record<string, unknown>) ?? {} },
      ];

    case StreamTypeEnum.MONITOR:
      return [...parts, { type: StreamTypeEnum.MONITOR, usage: c }];

    case StreamTypeEnum.ERROR:
      return [...parts, { type: StreamTypeEnum.ERROR, message: JSON.stringify(c) }];

    default:
      return parts;
  }
}
