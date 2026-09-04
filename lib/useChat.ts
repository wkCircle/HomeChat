'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import apiFetch from './api';
import { mergeConversations } from './conversations';
import { NdjsonParser } from './ndjson';
import { DEFAULT_MODEL, StreamTypeEnum } from './types';
import type {
  ChatMessage,
  ConversationHistory,
  ConversationPage,
  ConversationSummary,
  MessagePart,
  ModelsResponse,
  RunStatusResponse,
  StoredMessage,
  StreamEvent,
} from './types';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = (await response.json()) as { detail?: string; error?: string };
    return new Error(body.detail ?? body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

function storedMessageToChatMessage(message: StoredMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    status: message.status,
    parts: message.parts.reduce<MessagePart[]>((parts, part) => {
      return routeEvent(parts, { type: part.type, content: part.payload, metadata: {} });
    }, []),
  };
}

function initialTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  return normalized.length > 50 ? `${normalized.slice(0, 47).trimEnd()}...` : normalized;
}

interface PendingRunId {
  promise: Promise<string | null>;
  resolve: (runId: string | null) => void;
}

export interface UseChatOptions {
  returnReasoning?: boolean;
  returnFuncCallInfo?: boolean;
}

export function useChat({
  returnReasoning = true,
  returnFuncCallInfo = true,
}: UseChatOptions = {}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [streamingByConversation, setStreamingByConversation] = useState<
    Record<string, boolean>
  >({});
  const [errorsByConversation, setErrorsByConversation] = useState<
    Record<string, string | null>
  >({});
  const [models, setModels] = useState<string[]>([DEFAULT_MODEL]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const historyRequests = useRef(new Set<string>());
  const streamControllers = useRef(new Map<string, AbortController>());
  const runIdsByConversation = useRef(new Map<string, string>());
  const pendingRunIdsByConversation = useRef(new Map<string, PendingRunId>());
  const stoppedRunIds = useRef(new Set<string>());

  const synchronizeActiveRunIds = (items: ConversationSummary[]) => {
    for (const conversation of items) {
      if (conversation.active_run_id && stoppedRunIds.current.has(conversation.active_run_id)) {
        continue;
      }
      if (conversation.run_status === 'running' && conversation.active_run_id) {
        runIdsByConversation.current.set(conversation.id, conversation.active_run_id);
      } else {
        runIdsByConversation.current.delete(conversation.id);
      }
    }
  };

  const summariesWithCurrentRunStatus = (items: ConversationSummary[]) => items.map(
    (conversation) => (
      conversation.active_run_id && stoppedRunIds.current.has(conversation.active_run_id)
        ? { ...conversation, run_status: 'interrupted' as const, active_run_id: null }
        : conversation
    ),
  );

  const loadHistory = useCallback(async (conversationId: string) => {
    if (historyRequests.current.has(conversationId)) return;
    historyRequests.current.add(conversationId);
    try {
      const response = await apiFetch(`/api/chat/conversations/${conversationId}/messages`);
      if (!response.ok) {
        throw await responseError(response, `Unable to load conversation (${response.status})`);
      }
      const history = (await response.json()) as ConversationHistory;
      const conversation = summariesWithCurrentRunStatus([history.conversation])[0];
      synchronizeActiveRunIds([conversation]);
      setStreamingByConversation((current) => ({
        ...current,
        [conversationId]: conversation.run_status === 'running',
      }));
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: history.messages.map(storedMessageToChatMessage),
      }));
      setConversations((current) => mergeConversations(current, [conversation]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorsByConversation((current) => ({ ...current, [conversationId]: message }));
    } finally {
      historyRequests.current.delete(conversationId);
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function initialize() {
      const [modelsResult, conversationsResult] = await Promise.allSettled([
        apiFetch('/api/chat/models'),
        apiFetch('/api/chat/conversations?limit=20'),
      ]);
      if (!active) return;

      if (modelsResult.status === 'fulfilled' && modelsResult.value.ok) {
        const data = (await modelsResult.value.json()) as ModelsResponse;
        if (data.models.length > 0) setModels(data.models);
      }

      if (conversationsResult.status === 'fulfilled' && conversationsResult.value.ok) {
        const page = (await conversationsResult.value.json()) as ConversationPage;
        const conversations = summariesWithCurrentRunStatus(page.conversations);
        synchronizeActiveRunIds(conversations);
        setConversations(mergeConversations([], conversations));
        setNextCursor(page.next_cursor);
        const firstId = conversations[0]?.id ?? null;
        setSelectedConversationId(firstId);
        if (firstId) void loadHistory(firstId);
      }
      setIsInitializing(false);
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [loadHistory]);

  useEffect(() => {
    const runningConversationIds = conversations
      .filter((conversation) => conversation.run_status === 'running')
      .map((conversation) => conversation.id);
    if (runningConversationIds.length === 0) return;
    const revalidate = () => {
      for (const conversationId of runningConversationIds) void loadHistory(conversationId);
    };
    const timer = window.setInterval(revalidate, 2_000);
    return () => window.clearInterval(timer);
  }, [conversations, loadHistory]);

  const createConversation = useCallback(async () => {
    const unused = conversations.find(
      (conversation) =>
        conversation.title === 'New chat'
        && messagesByConversation[conversation.id]?.length === 0
        && !streamingByConversation[conversation.id],
    );
    if (unused) {
      setErrorsByConversation((current) => ({ ...current, [unused.id]: null }));
      setSelectedConversationId(unused.id);
      return unused;
    }

    const response = await apiFetch('/api/chat/conversations', {
      method: 'POST',
    });
    if (!response.ok) {
      throw await responseError(response, `Unable to create conversation (${response.status})`);
    }
    const conversation = (await response.json()) as ConversationSummary;
    setConversations((current) => mergeConversations(current, [conversation]));
    setMessagesByConversation((current) => ({
      ...current,
      [conversation.id]: current[conversation.id] ?? [],
    }));
    setErrorsByConversation((current) => ({ ...current, [conversation.id]: null }));
    setSelectedConversationId(conversation.id);
    return conversation;
  }, [conversations, messagesByConversation, streamingByConversation]);

  const selectConversation = useCallback(
    (conversationId: string) => {
      setSelectedConversationId(conversationId);
      setErrorsByConversation((current) => ({ ...current, [conversationId]: null }));
      if (!(conversationId in messagesByConversation)) void loadHistory(conversationId);
    },
    [loadHistory, messagesByConversation],
  );

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    const response = await apiFetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw await responseError(response, `Unable to rename conversation (${response.status})`);
    }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((current) => mergeConversations(current, [updated]));
  }, []);

  const setConversationPinned = useCallback(async (conversationId: string, pinned: boolean) => {
    const response = await apiFetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    if (!response.ok) {
      throw await responseError(response, `Unable to update conversation (${response.status})`);
    }
    const updated = (await response.json()) as ConversationSummary;
    setConversations((current) => mergeConversations(current, [updated]));
  }, []);

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const response = await apiFetch(`/api/chat/conversations/${conversationId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw await responseError(response, `Unable to delete conversation (${response.status})`);
      }
      streamControllers.current.get(conversationId)?.abort();
      runIdsByConversation.current.delete(conversationId);
      setConversations((current) => {
        const remaining = current.filter((conversation) => conversation.id !== conversationId);
        setSelectedConversationId((selected) => {
          if (selected !== conversationId) return selected;
          const nextId = remaining[0]?.id ?? null;
          if (nextId && !(nextId in messagesByConversation)) void loadHistory(nextId);
          return nextId;
        });
        return remaining;
      });
      setMessagesByConversation((current) => {
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    },
    [loadHistory, messagesByConversation],
  );

  const loadMoreConversations = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await apiFetch(
        `/api/chat/conversations?limit=20&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (!response.ok) {
        throw await responseError(response, `Unable to load conversations (${response.status})`);
      }
      const page = (await response.json()) as ConversationPage;
      const conversations = summariesWithCurrentRunStatus(page.conversations);
      synchronizeActiveRunIds(conversations);
      setConversations((current) => mergeConversations(current, conversations));
      setNextCursor(page.next_cursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor]);

  const append = useCallback(
    async (userMessage: string, selectedModel = DEFAULT_MODEL) => {
      const trimmedMessage = userMessage.trim();
      if (!trimmedMessage) return;

      let conversation = conversations.find((item) => item.id === selectedConversationId);
      if (!conversation) conversation = await createConversation();
      const conversationId = conversation.id;
      if (streamControllers.current.has(conversationId)) return;

      const promptTimestamp = new Date().toISOString();
      setConversations((current) =>
        mergeConversations(current, [{ ...conversation, last_message_at: promptTimestamp }]),
      );

      const existingMessages = messagesByConversation[conversationId] ?? [];
      if (existingMessages.length === 0 && conversation.title === 'New chat') {
        const title = initialTitle(trimmedMessage);
        void renameConversation(conversationId, title).catch(() => undefined);
      }

      const userMessageRecord: ChatMessage = {
        id: randomId(),
        role: 'user',
        status: 'completed',
        parts: [{ type: StreamTypeEnum.TEXT, text: trimmedMessage }],
      };
      const assistantId = randomId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        status: 'streaming',
        parts: [],
      };
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: [...(current[conversationId] ?? []), userMessageRecord, assistantMessage],
      }));
      setErrorsByConversation((current) => ({ ...current, [conversationId]: null }));
      setStreamingByConversation((current) => ({ ...current, [conversationId]: true }));

      const controller = new AbortController();
      streamControllers.current.set(conversationId, controller);
      let resolvePendingRunId: PendingRunId['resolve'];
      const pendingRunId = new Promise<string | null>((resolve) => {
        resolvePendingRunId = resolve;
      });
      const pendingRun = { promise: pendingRunId, resolve: resolvePendingRunId! };
      pendingRunIdsByConversation.current.set(conversationId, pendingRun);
      const updateParts = (updater: (parts: MessagePart[]) => MessagePart[]) => {
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: (current[conversationId] ?? []).map((message) =>
            message.id === assistantId
              ? { ...message, parts: updater(message.parts) }
              : message,
          ),
        }));
      };

      try {
        const response = await apiFetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmedMessage,
            model: selectedModel,
            thread_id: conversationId,
            kwargs: {
              return_reasoning_info: returnReasoning,
              return_func_call_start_info: returnFuncCallInfo,
              return_func_call_end_info: returnFuncCallInfo,
              return_token_info: false,
            },
          }),
        });
        if (!response.ok) {
          throw await responseError(response, `Chat request failed (${response.status})`);
        }
        const runId = response.headers.get('x-run-id');
        if (!runId) throw new Error('The chat response did not include a run identifier.');
        runIdsByConversation.current.set(conversationId, runId);
        pendingRun.resolve(runId);
        if (!response.body) throw new Error('The chat response did not include a stream body.');

        const reader = response.body.getReader();
        const parser = new NdjsonParser<StreamEvent>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parser.push(value)) {
            updateParts((parts) => routeEvent(parts, event));
          }
        }
        for (const event of parser.finish()) {
          updateParts((parts) => routeEvent(parts, event));
        }
        const finalStatus = stoppedRunIds.current.has(runId) ? 'interrupted' : 'completed';
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: (current[conversationId] ?? []).map((message) =>
            message.id === assistantId ? { ...message, status: finalStatus } : message,
          ),
        }));
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setErrorsByConversation((current) => ({ ...current, [conversationId]: message }));
        updateParts((parts) => [...parts, { type: StreamTypeEnum.ERROR, message }]);
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: (current[conversationId] ?? []).map((item) =>
            item.id === assistantId ? { ...item, status: 'failed' } : item,
          ),
        }));
      } finally {
        if (pendingRunIdsByConversation.current.get(conversationId) === pendingRun) {
          pendingRunIdsByConversation.current.delete(conversationId);
          pendingRun.resolve(null);
        }
        if (streamControllers.current.get(conversationId) === controller) {
          streamControllers.current.delete(conversationId);
          const runId = runIdsByConversation.current.get(conversationId);
          if (runId) stoppedRunIds.current.delete(runId);
          runIdsByConversation.current.delete(conversationId);
          setStreamingByConversation((current) => ({ ...current, [conversationId]: false }));
        }
      }
    },
    [
      conversations,
      createConversation,
      messagesByConversation,
      renameConversation,
      returnFuncCallInfo,
      returnReasoning,
      selectedConversationId,
    ],
  );

  const stopConversation = useCallback(async (conversationId: string) => {
    const runId = runIdsByConversation.current.get(conversationId)
      ?? await pendingRunIdsByConversation.current.get(conversationId)?.promise;
    if (!runId) throw new Error('The active run is no longer available.');
    stoppedRunIds.current.add(runId);
    let result: RunStatusResponse;
    try {
      const response = await apiFetch(`/api/chat/runs/${runId}/stop?wait=true`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw await responseError(response, `Unable to stop run (${response.status})`);
      }
      result = (await response.json()) as RunStatusResponse;
    } catch (error) {
      stoppedRunIds.current.delete(runId);
      throw error;
    }
    if (result.status === 'interrupted') {
      setMessagesByConversation((current) => ({
        ...current,
        [conversationId]: (current[conversationId] ?? []).map((message) =>
          message.role === 'assistant' && message.status === 'streaming'
            ? { ...message, status: 'interrupted' }
            : message,
        ),
      }));
    }
    streamControllers.current.get(conversationId)?.abort();
    runIdsByConversation.current.delete(conversationId);
    setStreamingByConversation((current) => ({ ...current, [conversationId]: false }));
    setConversations((current) => current.map((conversation) =>
      conversation.id === conversationId
        ? { ...conversation, run_status: result.status, active_run_id: null }
        : conversation,
    ));
  }, []);

  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;
  const messages = selectedConversationId
    ? messagesByConversation[selectedConversationId] ?? []
    : [];
  const isLoading = selectedConversationId
    ? Boolean(streamingByConversation[selectedConversationId])
    : false;
  const error = selectedConversationId ? errorsByConversation[selectedConversationId] ?? null : null;

  return {
    conversations,
    selectedConversation,
    selectedConversationId,
    messages,
    models,
    isLoading,
    isInitializing,
    isLoadingMore,
    hasMoreConversations: nextCursor !== null,
    error,
    streamingByConversation,
    append,
    createConversation,
    selectConversation,
    renameConversation,
    setConversationPinned,
    deleteConversation,
    stopConversation,
    loadMoreConversations,
  };
}

export function routeEvent(parts: MessagePart[], event: StreamEvent): MessagePart[] {
  const content = event.content;

  switch (event.type) {
    case StreamTypeEnum.TEXT: {
      const incoming = (content['text'] as string) ?? '';
      if (!incoming) return parts;
      const last = parts[parts.length - 1];
      if (last?.type === StreamTypeEnum.TEXT) {
        return [...parts.slice(0, -1), { ...last, text: last.text + incoming }];
      }
      return [...parts, { type: StreamTypeEnum.TEXT, text: incoming }];
    }
    case StreamTypeEnum.REASONING: {
      const incoming = (content['text'] as string) ?? '';
      if (!incoming.trim()) return parts;
      const last = parts[parts.length - 1];
      if (last?.type === StreamTypeEnum.REASONING) {
        return [...parts.slice(0, -1), { ...last, text: last.text + incoming }];
      }
      return [...parts, { type: StreamTypeEnum.REASONING, text: incoming }];
    }
    case StreamTypeEnum.FUNC_CALL_START:
      return [...parts, { type: StreamTypeEnum.FUNC_CALL_START, calls: content }];
    case StreamTypeEnum.FUNC_CALL_END:
      return [
        ...parts,
        {
          type: StreamTypeEnum.FUNC_CALL_END,
          tool_call_id: content['tool_call_id'] as string,
          name: content['name'] as string,
          status: content['status'] as 'success' | 'error',
          content: content['content'],
        },
      ];
    case StreamTypeEnum.UI:
      return [
        ...parts,
        {
          type: StreamTypeEnum.UI,
          artifact: (content['artifact'] as Record<string, unknown>) ?? {},
        },
      ];
    case StreamTypeEnum.INTERACTIVE:
      return [
        ...parts,
        {
          type: StreamTypeEnum.INTERACTIVE,
          artifact: (content['artifact'] as Record<string, unknown>) ?? {},
        },
      ];
    case StreamTypeEnum.MONITOR:
      return [...parts, { type: StreamTypeEnum.MONITOR, usage: content }];
    case StreamTypeEnum.ERROR:
      return [
        ...parts,
        {
          type: StreamTypeEnum.ERROR,
          message: typeof content['message'] === 'string' ? content['message'] : JSON.stringify(content),
        },
      ];
    default:
      return parts;
  }
}