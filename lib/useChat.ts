'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import apiFetch, { responseError } from './api';
import { readCitationContent } from './citations';
import { useUserSettings } from './useUserSettings';
import { mergeConversations } from './conversations';
import { NdjsonParser } from './ndjson';
import { DEFAULT_MODEL, StreamTypeEnum } from './types';
import type {
  ChatMessage,
  ConversationHistory,
  ConversationPage,
  ConversationSummary,
  ConversationUsage,
  ModelPricing,
  MessagePart,
  ModelsResponse,
  RunStatusResponse,
  StoredMessage,
  StreamEvent,
  ToolId,
  UserSettingsUpdate,
} from './types';

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
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
  const preferences = useUserSettings();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messagesByConversation, setMessagesByConversation] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [streamingByConversation, setStreamingByConversation] = useState<
    Record<string, boolean>
  >({});
  const [compactingByConversation, setCompactingByConversation] = useState<
    Record<string, boolean>
  >({});
  const [errorsByConversation, setErrorsByConversation] = useState<
    Record<string, string | null>
  >({});
  const [models, setModels] = useState<string[]>([DEFAULT_MODEL]);
  const [contextWindows, setContextWindows] = useState<Record<string, number>>({});
  const [modelPricing, setModelPricing] = useState<Record<string, ModelPricing | null>>({});
  const [usageByConversation, setUsageByConversation] = useState<Record<string, ConversationUsage>>({});
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const historyRequests = useRef(new Set<string>());
  const streamControllers = useRef(new Map<string, AbortController>());
  const runIdsByConversation = useRef(new Map<string, string>());
  const pendingRunIdsByConversation = useRef(new Map<string, PendingRunId>());
  const stoppedRunIds = useRef(new Set<string>());
  const selectedIdRef = useRef(selectedConversationId);
  selectedIdRef.current = selectedConversationId;
  const toolVersions = useRef(new Map<string, number>());
  const toolReads = useRef(new Map<string, number>());
  const toolSaves = useRef(new Set<string>());
  const [savingTools, setSavingTools] = useState<Record<string, boolean>>({});
  const [loadingTools, setLoadingTools] = useState<Record<string, boolean>>({});
  const [toolErrors, setToolErrors] = useState<Record<string, string | null>>({});
  const draftToolsKey = '__draft__';

  const mergeServerConversations = useCallback((
    incoming: ConversationSummary[], versions: Map<string, number>,
  ) => {
    setConversations((current) => mergeConversations(current, incoming.map((item) => {
      const confirmed = current.find((conversation) => conversation.id === item.id);
      return confirmed && (versions.get(item.id) ?? 0) !== (toolVersions.current.get(item.id) ?? 0)
        ? { ...item, tool_settings: confirmed.tool_settings }
        : item;
    })));
  }, []);

  const refreshConversationTools = useCallback(async (conversationId: string) => {
    const version = toolVersions.current.get(conversationId) ?? 0;
    const request = (toolReads.current.get(conversationId) ?? 0) + 1;
    toolReads.current.set(conversationId, request);
    setLoadingTools((current) => ({ ...current, [conversationId]: true }));
    try {
      const response = await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?limit=1`);
      if (!response.ok) throw await responseError(response, 'Unable to load chat tool settings.');
      const history = (await response.json()) as ConversationHistory;
      if (toolReads.current.get(conversationId) === request
        && (toolVersions.current.get(conversationId) ?? 0) === version
        && !toolSaves.current.has(conversationId)) {
        setConversations((current) => current.map((conversation) => conversation.id === conversationId
          ? { ...conversation, tool_settings: history.conversation.tool_settings } : conversation));
        setToolErrors((current) => ({ ...current, [conversationId]: null }));
      }
    } catch (error) {
      if (toolReads.current.get(conversationId) === request
        && (toolVersions.current.get(conversationId) ?? 0) === version) {
        setToolErrors((current) => ({ ...current, [conversationId]: error instanceof Error ? error.message : String(error) }));
      }
    } finally {
      if (toolReads.current.get(conversationId) === request) {
        setLoadingTools((current) => ({ ...current, [conversationId]: false }));
      }
    }
  }, []);

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

  const loadUsage = useCallback(async (conversationId: string) => {
    const response = await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/usage`);
    if (!response.ok) return;
    const usage = (await response.json()) as ConversationUsage;
    setUsageByConversation((current) => ({ ...current, [conversationId]: usage }));
  }, []);

  const loadHistory = useCallback(async (conversationId: string) => {
    if (historyRequests.current.has(conversationId)) return;
    historyRequests.current.add(conversationId);
    const versions = new Map(toolVersions.current);
    try {
      const response = await apiFetch(`/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`);
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
      mergeServerConversations([conversation], versions);
      void loadUsage(conversationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorsByConversation((current) => ({ ...current, [conversationId]: message }));
    } finally {
      historyRequests.current.delete(conversationId);
    }
  }, [loadUsage, mergeServerConversations]);

  useEffect(() => {
    let active = true;
    const requestedConversationId = new URL(window.location.href).searchParams.get('thread_id');
    async function initialize() {
      const [modelsResult, conversationsResult] = await Promise.allSettled([
        apiFetch('/api/chat/models'),
        apiFetch('/api/chat/conversations?limit=20'),
      ]);
      if (!active) return;

      if (modelsResult.status === 'fulfilled' && modelsResult.value.ok) {
        const data = (await modelsResult.value.json()) as ModelsResponse;
        if (data.models.length > 0) setModels(data.models);
        setContextWindows(data.context_windows);
        setModelPricing(data.pricing);
      }

      let firstId: string | null = null;
      if (conversationsResult.status === 'fulfilled' && conversationsResult.value.ok) {
        const page = (await conversationsResult.value.json()) as ConversationPage;
        const conversations = summariesWithCurrentRunStatus(page.conversations);
        synchronizeActiveRunIds(conversations);
        setConversations(mergeConversations([], conversations));
        setNextCursor(page.next_cursor);
        firstId = conversations[0]?.id ?? null;
      }
      // History can restore a bookmarked conversation outside the first sidebar page.
      const initialId = requestedConversationId || firstId;
      selectedIdRef.current = initialId;
      setSelectedConversationId(initialId);
      if (initialId) void loadHistory(initialId);
      setIsInitializing(false);
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [loadHistory]);

  useEffect(() => {
    // Do not clear the incoming thread_id before initialization has restored it.
    if (isInitializing) return;
    const url = new URL(window.location.href);
    if (selectedConversationId) {
      url.searchParams.set('thread_id', selectedConversationId);
    } else {
      url.searchParams.delete('thread_id');
    }
    if (url.href !== window.location.href) {
      window.history.replaceState(window.history.state, '', url);
    }
  }, [isInitializing, selectedConversationId]);

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

  const createConversation = useCallback(async (select = true) => {
    const unused = conversations.find(
      (conversation) =>
        conversation.title === 'New chat'
        && messagesByConversation[conversation.id]?.length === 0
        && !streamingByConversation[conversation.id],
    );
    if (unused) {
      setErrorsByConversation((current) => ({ ...current, [unused.id]: null }));
      if (select) { selectedIdRef.current = unused.id; setSelectedConversationId(unused.id); }
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
    if (select) { selectedIdRef.current = conversation.id; setSelectedConversationId(conversation.id); }
    return conversation;
  }, [conversations, messagesByConversation, streamingByConversation]);

  const selectConversation = useCallback(
    (conversationId: string) => {
      selectedIdRef.current = conversationId;
      setSelectedConversationId(conversationId);
      setErrorsByConversation((current) => ({ ...current, [conversationId]: null }));
      if (!(conversationId in messagesByConversation)) void loadHistory(conversationId);
      else void refreshConversationTools(conversationId);
    },
    [loadHistory, messagesByConversation, refreshConversationTools],
  );

  const renameConversation = useCallback(async (conversationId: string, title: string) => {
    const versions = new Map(toolVersions.current);
    const response = await apiFetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) {
      throw await responseError(response, `Unable to rename conversation (${response.status})`);
    }
    const updated = (await response.json()) as ConversationSummary;
    mergeServerConversations([updated], versions);
  }, [mergeServerConversations]);

  const setConversationPinned = useCallback(async (conversationId: string, pinned: boolean) => {
    const versions = new Map(toolVersions.current);
    const response = await apiFetch(`/api/chat/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    if (!response.ok) {
      throw await responseError(response, `Unable to update conversation (${response.status})`);
    }
    const updated = (await response.json()) as ConversationSummary;
    mergeServerConversations([updated], versions);
  }, [mergeServerConversations]);

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
    const versions = new Map(toolVersions.current);
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
      mergeServerConversations(conversations, versions);
      setNextCursor(page.next_cursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, nextCursor, mergeServerConversations]);

  const setConversationTool = useCallback(async (toolId: ToolId, enabled: boolean) => {
    const selectedId = selectedIdRef.current;
    const key = selectedId ?? draftToolsKey;
    let targetId = selectedId;
    if (toolSaves.current.has(key)) return;
    toolSaves.current.add(key);
    setSavingTools((current) => ({ ...current, [key]: true }));
    setToolErrors((current) => ({ ...current, [key]: null }));
    try {
      if (preferences.isSaving()) throw new Error('Wait for default settings to finish saving.');
      if (!selectedId) {
        const conversation = await createConversation(false);
        targetId = conversation.id;
        toolSaves.current.add(targetId);
        setSavingTools((current) => ({ ...current, [conversation.id]: true }));
        if (selectedIdRef.current === null) {
          selectedIdRef.current = conversation.id;
          setSelectedConversationId(conversation.id);
        }
      }
      if (!targetId) throw new Error('No conversation is available for tool settings.');
      toolVersions.current.set(targetId, (toolVersions.current.get(targetId) ?? 0) + 1);
      const response = await apiFetch(`/api/chat/conversations/${encodeURIComponent(targetId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_settings: { [toolId]: enabled } }),
      });
      if (!response.ok) throw await responseError(response, 'Unable to save chat tool settings.');
      const updated = (await response.json()) as ConversationSummary;
      setConversations((current) => current.map((conversation) => conversation.id === updated.id
        ? { ...conversation, tool_settings: updated.tool_settings, updated_at: updated.updated_at }
        : conversation));
      setToolErrors((current) => ({ ...current, [updated.id]: null }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToolErrors((current) => ({ ...current, [key]: message, ...(targetId ? { [targetId]: message } : {}) }));
    } finally {
      toolSaves.current.delete(key);
      if (targetId) {
        toolSaves.current.delete(targetId);
        toolVersions.current.set(targetId, (toolVersions.current.get(targetId) ?? 0) + 1);
      }
      setSavingTools((current) => ({ ...current, [key]: false, ...(targetId ? { [targetId]: false } : {}) }));
    }
  }, [createConversation, preferences.isSaving]);

  const saveUserSettings = useCallback(async (update: UserSettingsUpdate) => {
    const saved = await preferences.saveSettings(update);
    const selectedId = selectedIdRef.current;
    if (saved && update.tool_defaults) {
      for (const conversation of conversations) {
        toolVersions.current.set(conversation.id, (toolVersions.current.get(conversation.id) ?? 0) + 1);
      }
      if (selectedId) await refreshConversationTools(selectedId);
    }
    return saved;
  }, [conversations, preferences.saveSettings, refreshConversationTools]);

  const retryToolSettings = useCallback(async () => {
    await preferences.reloadSettings();
    const selectedId = selectedIdRef.current;
    if (selectedId) await refreshConversationTools(selectedId);
  }, [preferences.reloadSettings, refreshConversationTools]);

  const append = useCallback(
    async (userMessage: string, selectedModel = DEFAULT_MODEL) => {
      const trimmedMessage = userMessage.trim();
      if (!trimmedMessage) return;
      if (preferences.isSaving() || toolSaves.current.has(selectedIdRef.current ?? draftToolsKey)) {
        throw new Error('Wait for tool settings to finish saving before sending.');
      }

      let conversation = conversations.find((item) => item.id === selectedConversationId);
      if (!conversation) conversation = await createConversation();
      const conversationId = conversation.id;
      if (streamControllers.current.has(conversationId)) return;

      const promptTimestamp = new Date().toISOString();
      setConversations((current) =>
        mergeConversations(current, [{ ...conversation, last_message_at: promptTimestamp }]),
      );

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
        let streamFailed = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const event of parser.push(value)) {
            if (event.type === StreamTypeEnum.ERROR) streamFailed = true;
            if (event.type === StreamTypeEnum.COMPACTING) {
              setCompactingByConversation((current) => ({
                ...current,
                [conversationId]: event.content['active'] === true,
              }));
              continue;
            }
            updateParts((parts) => routeEvent(parts, event));
          }
        }
        for (const event of parser.finish()) {
          if (event.type === StreamTypeEnum.ERROR) streamFailed = true;
          if (event.type === StreamTypeEnum.COMPACTING) {
            setCompactingByConversation((current) => ({
              ...current,
              [conversationId]: event.content['active'] === true,
            }));
            continue;
          }
          updateParts((parts) => routeEvent(parts, event));
        }
        const finalStatus = stoppedRunIds.current.has(runId) ? 'interrupted' : streamFailed ? 'failed' : 'completed';
        setMessagesByConversation((current) => ({
          ...current,
          [conversationId]: (current[conversationId] ?? []).map((message) =>
            message.id === assistantId ? { ...message, status: finalStatus } : message,
          ),
        }));
        if (finalStatus !== 'interrupted') { await loadHistory(conversationId); await loadUsage(conversationId); }
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
          setCompactingByConversation((current) => ({ ...current, [conversationId]: false }));
        }
      }
    },
    [
      conversations,
      createConversation,
      loadHistory,
      messagesByConversation,
      returnFuncCallInfo,
      returnReasoning,
      selectedConversationId,
      preferences.isSaving,
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
    setCompactingByConversation((current) => ({ ...current, [conversationId]: false }));
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
  const isCompacting = selectedConversationId
    ? Boolean(compactingByConversation[selectedConversationId])
    : false;
  const error = selectedConversationId ? errorsByConversation[selectedConversationId] ?? null : null;

  return {
    conversations,
    preferences: { ...preferences, saveSettings: saveUserSettings },
    selectedToolSettings: selectedConversation?.tool_settings ?? preferences.settings?.tool_defaults ?? {},
    isSavingConversationTools: Boolean(savingTools[selectedConversationId ?? draftToolsKey]),
    isLoadingConversationTools: Boolean(loadingTools[selectedConversationId ?? draftToolsKey])
      || isInitializing || preferences.isLoadingSettings || !preferences.settings
      || Boolean(selectedConversationId && !selectedConversation),
    toolSettingsError: toolErrors[selectedConversationId ?? draftToolsKey] ?? preferences.error,
    setConversationTool,
    retryToolSettings,
    selectedConversation,
    selectedConversationId,
    messages,
    models,
    contextWindows,
    modelPricing,
    isLoading,
    isCompacting,
    isInitializing,
    isLoadingMore,
    hasMoreConversations: nextCursor !== null,
    error,
    streamingByConversation,
    selectedConversationUsage: selectedConversationId ? usageByConversation[selectedConversationId] ?? null : null,
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
      const snapshot = readCitationContent(content);
      if (!snapshot.text) return parts;
      if (snapshot.part_id) {
        const index = parts.findIndex(part => part.type === StreamTypeEnum.TEXT && part.part_id === snapshot.part_id);
        const next = {type: StreamTypeEnum.TEXT, ...snapshot};
        return index < 0 ? [...parts, next] : parts.map((part, position) => position === index ? next : part);
      }
      const last = parts[parts.length - 1];
      if (!snapshot.sources && !snapshot.citations && last?.type === StreamTypeEnum.TEXT && !last.part_id && !last.sources && !last.citations) {
        return [...parts.slice(0, -1), {...last, text: last.text + snapshot.text}];
      }
      return [...parts, {type: StreamTypeEnum.TEXT, ...snapshot}];
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