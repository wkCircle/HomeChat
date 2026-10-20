import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationHistory, ConversationPage, ConversationSummary } from './types';
import { useChat } from './useChat';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./api', async (original) => ({ ...await original<typeof import('./api')>(), default: apiFetchMock }));

beforeEach(() => {
  window.history.replaceState(null, '', '/chatbot');
  apiFetchMock.mockReset();
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

const conversation: ConversationSummary = {
  id: 'conversation-1',
  title: 'New chat',
  pinned: false,
  tool_settings: {},
  run_status: null,
  active_run_id: null,
  created_at: '2026-09-04T00:00:00Z',
  updated_at: '2026-09-04T00:00:00Z',
  last_message_at: '2026-09-04T00:00:00Z',
};

function jsonResponse(payload: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function initializeResponses(history: ConversationHistory) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path === '/api/chat/conversations/conversation-1/usage') return Promise.resolve(jsonResponse({ conversation_id: 'conversation-1', invocations: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null, latest_input_tokens: 0, latest_model: null }));
    if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
    if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
    if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-6-luna'], context_windows: { 'gpt-6-luna': 1_050_000 }, pricing: { 'gpt-6-luna': null } }));
    if (path === '/api/chat/conversations?limit=20') {
      const page: ConversationPage = { conversations: [history.conversation], next_cursor: null };
      return Promise.resolve(jsonResponse(page));
    }
    if (path === '/api/chat/conversations/conversation-1/messages' || path === '/api/chat/conversations/conversation-1/messages?limit=1') {
      return Promise.resolve(jsonResponse(history));
    }
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe('useChat conversation URL', () => {
  it('restores the URL conversation instead of the first sidebar conversation', async () => {
    const bookmarked = { ...conversation, id: 'bookmarked-chat', title: 'Bookmarked chat' };
    window.history.replaceState({ preserved: true }, '', '/chatbot?thread_id=bookmarked-chat&other=value#messages');
    initializeResponses({ conversation, messages: [], truncated: false });
    const defaultImplementation = apiFetchMock.getMockImplementation()!;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/conversations/bookmarked-chat/messages') {
        return Promise.resolve(jsonResponse({ conversation: bookmarked, messages: [], truncated: false }));
      }
      if (path === '/api/chat/conversations/bookmarked-chat/usage') {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return defaultImplementation(path);
    });

    const { result, unmount } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.selectedConversation?.title).toBe('Bookmarked chat'));
    expect(result.current.selectedConversationId).toBe(bookmarked.id);
    expect(result.current.conversations).toContainEqual(bookmarked);
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/chat/conversations/conversation-1/messages');
    expect(window.location.search).toBe('?thread_id=bookmarked-chat&other=value');
    expect(window.location.hash).toBe('#messages');
    expect(window.history.state).toEqual({ preserved: true });

    unmount();
    const reloaded = renderHook(() => useChat());
    await waitFor(() => expect(reloaded.result.current.selectedConversation?.id).toBe(bookmarked.id));
  });

  it('updates the URL when selecting a chat and restores that selection on remount', async () => {
    const second = { ...conversation, id: 'conversation-2' };
    initializeResponses({ conversation, messages: [], truncated: false });
    const defaultImplementation = apiFetchMock.getMockImplementation()!;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/conversations/conversation-2/messages' || path === '/api/chat/conversations/conversation-2/messages?limit=1') {
        return Promise.resolve(jsonResponse({ conversation: second, messages: [], truncated: false }));
      }
      if (path === '/api/chat/conversations/conversation-2/usage') {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return defaultImplementation(path);
    });
    const { result, unmount } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    expect(window.location.search).toBe('?thread_id=conversation-1');

    act(() => result.current.selectConversation(second.id));
    await waitFor(() => expect(result.current.selectedConversation?.id).toBe(second.id));
    expect(window.location.search).toBe('?thread_id=conversation-2');

    unmount();
    const reloaded = renderHook(() => useChat());
    await waitFor(() => expect(reloaded.result.current.selectedConversation?.id).toBe(second.id));
  });

  it('updates the URL for a newly created chat and clears it when the last chat is deleted', async () => {
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
      if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
      if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: [], context_windows: {}, pricing: {} }));
      if (path === '/api/chat/conversations?limit=20') return Promise.resolve(jsonResponse({ conversations: [], next_cursor: null }));
      if (path === '/api/chat/conversations' && options?.method === 'POST') return Promise.resolve(jsonResponse(conversation));
      if (path === '/api/chat/conversations/conversation-1' && options?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 204 }));
      throw new Error(`Unexpected request: ${path}`);
    });
    window.history.replaceState(null, '', '/chatbot?other=value');
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    await act(async () => { await result.current.createConversation(); });
    expect(new URL(window.location.href).searchParams.get('thread_id')).toBe(conversation.id);
    await act(async () => { await result.current.deleteConversation(conversation.id); });
    expect(result.current.selectedConversationId).toBeNull();
    expect(window.location.search).toBe('?other=value');
  });

  it('keeps an unavailable bookmarked chat selected and displays the history error', async () => {
    window.history.replaceState(null, '', '/chatbot?thread_id=missing-chat');
    initializeResponses({ conversation, messages: [], truncated: false });
    const defaultImplementation = apiFetchMock.getMockImplementation()!;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/conversations/missing-chat/messages') {
        return Promise.resolve(new Response(JSON.stringify({ detail: 'Conversation not found' }), { status: 404 }));
      }
      return defaultImplementation(path);
    });
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.error).toBe('Conversation not found'));
    expect(result.current.selectedConversationId).toBe('missing-chat');
    expect(window.location.search).toBe('?thread_id=missing-chat');
  });
});

describe('useChat stop behavior', () => {
  it('loads the AI-generated title after the first stream without renaming locally', async () => {
    const generatedConversation = { ...conversation, title: 'Annual Home Maintenance Plan' };
    let historyRequests = 0;
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => {
      if (path === '/api/chat/conversations/conversation-1/usage') return Promise.resolve(jsonResponse({ conversation_id: 'conversation-1', invocations: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null, latest_input_tokens: 0, latest_model: null }));
    if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
    if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
    if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-6-luna'], context_windows: { 'gpt-6-luna': 1_050_000 }, pricing: { 'gpt-6-luna': null } }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({ conversations: [conversation], next_cursor: null }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages' || path === '/api/chat/conversations/conversation-1/messages?limit=1') {
        historyRequests += 1;
        return Promise.resolve(jsonResponse(historyRequests === 1
          ? { conversation, messages: [], truncated: false }
          : {
            conversation: generatedConversation,
            messages: [{
              id: 'user-1', role: 'user', ordinal: 0, status: 'completed',
              parts: [{
                id: 'part-1', position: 0, type: 'text',
                payload: { text: 'Plan annual maintenance' },
                created_at: '2026-09-04T00:00:00Z',
              }],
              created_at: '2026-09-04T00:00:00Z',
              updated_at: '2026-09-04T00:00:00Z',
            }],
            truncated: false,
          }));
      }
      if (path === '/api/chat/stream') {
        expect(options?.method).toBe('POST');
        return Promise.resolve(new Response(
          '{"type":"text","content":{"text":"Done"},"metadata":{}}\n',
          { headers: { 'X-Run-ID': 'run-1' } },
        ));
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => {
      await result.current.append('Plan annual maintenance');
    });

    expect(result.current.selectedConversation?.title).toBe('Annual Home Maintenance Plan');
    expect(historyRequests).toBe(2);
    expect(apiFetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });

  it('restores persisted chart and table artifacts from conversation history', async () => {
    const chart = {
      type: 'graph', renderer: 'plotly', format: 'json',
      data: { props: { figure: { data: [{ type: 'bar', x: ['A'], y: [3] }] } } },
    };
    const table = {
      type: 'table',
      data: { title: 'Stored table', columns: ['name', 'value'], rows: [{ name: 'A', value: 3 }] },
    };
    initializeResponses({
      conversation,
      messages: [{
        id: 'assistant-1',
        role: 'assistant',
        ordinal: 0,
        status: 'completed',
        parts: [
          {
            id: 'chart-part', position: 0, type: 'ui', payload: { artifact: chart },
            created_at: '2026-09-04T00:00:00Z',
          },
          {
            id: 'table-part', position: 1, type: 'ui', payload: { artifact: table },
            created_at: '2026-09-04T00:00:01Z',
          },
        ],
        created_at: '2026-09-04T00:00:00Z',
        updated_at: '2026-09-04T00:00:01Z',
      }],
      truncated: false,
    });

    const { result } = renderHook(() => useChat());

    await waitFor(() => expect(result.current.isInitializing).toBe(false));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].parts).toEqual([
      { type: 'ui', artifact: chart },
      { type: 'ui', artifact: table },
    ]);
  });

  it('handles split and multiple compaction NDJSON events without adding transcript parts', async () => {
    let historyRequests = 0;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/conversations/conversation-1/usage') return Promise.resolve(jsonResponse({ conversation_id: 'conversation-1', invocations: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null, latest_input_tokens: 0, latest_model: null }));
      if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
      if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
      if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-6-luna'], context_windows: { 'gpt-6-luna': 1_050_000 }, pricing: { 'gpt-6-luna': null } }));
      if (path === '/api/chat/conversations?limit=20') return Promise.resolve(jsonResponse({ conversations: [conversation], next_cursor: null }));
      if (path === '/api/chat/conversations/conversation-1/messages' || path === '/api/chat/conversations/conversation-1/messages?limit=1') {
        historyRequests += 1;
        return Promise.resolve(jsonResponse(historyRequests === 1
          ? { conversation, messages: [], truncated: false }
          : {
            conversation,
            messages: [{
              id: 'assistant-1', role: 'assistant', ordinal: 1, status: 'completed',
              parts: [{ id: 'part-1', position: 0, type: 'text', payload: { text: 'Done' }, created_at: '2026-09-04T00:00:00Z' }],
              created_at: '2026-09-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z',
            }],
            truncated: false,
          }));
      }
      if (path === '/api/chat/stream') {
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('{"type":"comp'));
            controller.enqueue(encoder.encode('acting","content":{"active":true},"metadata":{}}\n{"type":"text","content":{"text":"Done"},"metadata":{}}\n{"type":"compacting","content":{"active":false},"metadata":{}}\n'));
            controller.close();
          },
        });
        return Promise.resolve(new Response(stream, { headers: { 'X-Run-ID': 'run-1' } }));
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => {
      await result.current.append('Compact this conversation');
    });

    expect(result.current.isCompacting).toBe(false);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].parts).toEqual([{ type: 'text', text: 'Done' }]);
  });

  it('waits for a newly submitted stream run ID before stopping it', async () => {
    const history: ConversationHistory = { conversation, messages: [], truncated: false };
    const streamResponse = deferred<Response>();
    initializeResponses(history);
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/stream') return streamResponse.promise;
      if (path === '/api/chat/runs/run-1/stop?wait=true') {
        return Promise.resolve(jsonResponse({
          run_id: 'run-1', status: 'interrupted', cancel_requested: true,
        }));
      }
      if (path === '/api/chat/conversations/conversation-1/usage') return Promise.resolve(jsonResponse({ conversation_id: 'conversation-1', invocations: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null, latest_input_tokens: 0, latest_model: null }));
    if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
    if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
    if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-6-luna'], context_windows: { 'gpt-6-luna': 1_050_000 }, pricing: { 'gpt-6-luna': null } }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({ conversations: [conversation], next_cursor: null }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages' || path === '/api/chat/conversations/conversation-1/messages?limit=1') {
        return Promise.resolve(jsonResponse(history));
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    act(() => {
      void result.current.append('Stop immediately');
    });
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    let stopPromise!: Promise<void>;
    act(() => {
      stopPromise = result.current.stopConversation(conversation.id);
    });
    expect(apiFetchMock).not.toHaveBeenCalledWith('/api/chat/runs/run-1/stop?wait=true', expect.anything());

    await act(async () => {
      streamResponse.resolve(new Response('', { headers: { 'X-Run-ID': 'run-1' } }));
      await stopPromise;
    });

    expect(apiFetchMock).toHaveBeenCalledWith('/api/chat/runs/run-1/stop?wait=true', {
      method: 'POST',
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.messages.at(-1)?.status).toBe('interrupted');
  });

  it('does not restore a stopped run from a late running history response', async () => {
    const runningConversation = {
      ...conversation,
      run_status: 'running' as const,
      active_run_id: 'run-1',
    };
    const lateHistory = deferred<Response>();
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/conversations/conversation-1/usage') return Promise.resolve(jsonResponse({ conversation_id: 'conversation-1', invocations: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null, latest_input_tokens: 0, latest_model: null }));
    if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
    if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
    if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-6-luna'], context_windows: { 'gpt-6-luna': 1_050_000 }, pricing: { 'gpt-6-luna': null } }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({
          conversations: [runningConversation], next_cursor: null,
        }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages' || path === '/api/chat/conversations/conversation-1/messages?limit=1') return lateHistory.promise;
      if (path === '/api/chat/runs/run-1/stop?wait=true') {
        return Promise.resolve(jsonResponse({
          run_id: 'run-1', status: 'interrupted', cancel_requested: true,
        }));
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isInitializing).toBe(false));

    await act(async () => {
      await result.current.stopConversation(conversation.id);
    });
    await act(async () => {
      lateHistory.resolve(jsonResponse({
        conversation: runningConversation,
        messages: [],
        truncated: false,
      }));
    });

    await waitFor(() => expect(result.current.selectedConversation?.run_status).toBe('interrupted'));
    expect(result.current.selectedConversation?.active_run_id).toBeNull();
    expect(result.current.streamingByConversation[conversation.id]).toBe(false);
  });

  it('refreshes a reloaded running conversation until its persisted response completes', async () => {
    const runningConversation = {
      ...conversation,
      run_status: 'running' as const,
      active_run_id: 'run-1',
    };
    const completedConversation = {
      ...conversation,
      run_status: 'completed' as const,
      active_run_id: null,
    };
    let historyRequests = 0;
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/conversations/conversation-1/usage') return Promise.resolve(jsonResponse({ conversation_id: 'conversation-1', invocations: 0, input_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 0, total_tokens: 0, estimated_cost_usd: null, latest_input_tokens: 0, latest_model: null }));
    if (path === '/api/chat/settings') return Promise.resolve(jsonResponse({ theme: 'system', font_size: 'medium', tool_defaults: {}, created_at: null, updated_at: null }));
    if (path === '/api/chat/tools') return Promise.resolve(jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] }));
    if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-6-luna'], context_windows: { 'gpt-6-luna': 1_050_000 }, pricing: { 'gpt-6-luna': null } }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({
          conversations: [runningConversation], next_cursor: null,
        }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages' || path === '/api/chat/conversations/conversation-1/messages?limit=1') {
        historyRequests += 1;
        return Promise.resolve(jsonResponse(historyRequests === 1
          ? {
            conversation: runningConversation,
            messages: [{
              id: 'assistant-1',
              role: 'assistant',
              ordinal: 1,
              status: 'streaming',
              parts: [],
              created_at: '2026-09-04T00:00:00Z',
              updated_at: '2026-09-04T00:00:00Z',
            }],
            truncated: false,
          }
          : {
            conversation: completedConversation,
            messages: [{
              id: 'assistant-1',
              role: 'assistant',
              ordinal: 1,
              status: 'completed',
              parts: [{
                id: 'part-1', position: 0, type: 'text', payload: { text: 'Finished' },
                created_at: '2026-09-04T00:00:01Z',
              }],
              created_at: '2026-09-04T00:00:00Z',
              updated_at: '2026-09-04T00:00:01Z',
            }],
            truncated: false,
          },
        ));
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useChat());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(historyRequests).toBe(1);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.messages.at(-1)?.status).toBe('streaming');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(result.current.selectedConversation?.run_status).toBe('completed');
      expect(result.current.selectedConversation?.active_run_id).toBeNull();
      expect(result.current.messages[0]?.parts).toEqual([{ type: 'text', text: 'Finished' }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('failed stream completion', () => {
  it.each([true, false])('marks a terminal error failed before history refresh (newline: %s)', async (newline) => {
    initializeResponses({ conversation, messages: [], truncated: false });
    const fallback = apiFetchMock.getMockImplementation()!;
    const refresh = deferred<Response>();
    let historyReads = 0;
    const frame = JSON.stringify({ type: 'error', content: { message: 'The response failed. Please try again.' }, metadata: {} }) + (newline ? '\n' : '');
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/api/chat/stream') {
        return Promise.resolve(new Response(new ReadableStream({ start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(frame.slice(0, 17)));
          controller.enqueue(encoder.encode(frame.slice(17)));
          controller.close();
        } }), { headers: { 'X-Run-ID': 'failed-run' } }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages' && ++historyReads > 1) return refresh.promise;
      return fallback(path);
    });
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    await waitFor(() => expect(historyReads).toBe(1));
    let sending!: Promise<void>;
    act(() => { sending = result.current.append('Diagnostic'); });
    try {
      await waitFor(() => expect(result.current.messages.at(-1)?.status).toBe('failed'));
      expect(apiFetchMock.mock.calls.filter(([path]) => path === '/api/chat/stream')).toHaveLength(1);
    } finally {
      await act(async () => {
        refresh.resolve(jsonResponse({ conversation, truncated: false, messages: [
          { id: 'saved-user', role: 'user', ordinal: 0, status: 'completed', parts: [{ id: 'prompt', position: 0, type: 'text', payload: { text: 'Diagnostic' }, created_at: '' }], created_at: '', updated_at: '' },
          { id: 'saved-assistant', role: 'assistant', ordinal: 1, status: 'failed', parts: [], created_at: '', updated_at: '' },
        ] }));
        await sending;
      });
    }
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages.at(-1)?.status).toBe('failed');
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useChat tool preferences', () => {
  function configureTools(initial: ConversationSummary[] = [conversation]) {
    const rows = new Map(initial.map((row) => [row.id, row]));
    let settings = { theme: 'system', font_size: 'medium', tool_defaults: { web_search: false }, created_at: null, updated_at: null };
    const history = (row: ConversationSummary) => ({ conversation: row, messages: [], truncated: false });
    const handle = async (path: string, options?: RequestInit): Promise<Response> => {
      if (path === '/api/chat/settings') {
        if (options?.method === 'PATCH') settings = { ...settings, ...JSON.parse(String(options.body)) };
        return jsonResponse(settings);
      }
      if (path === '/api/chat/tools') return jsonResponse({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] });
      if (path === '/api/chat/models') return jsonResponse({ models: [], context_windows: {}, pricing: {} });
      if (path === '/api/chat/conversations?limit=20') return jsonResponse({ conversations: [...rows.values()], next_cursor: null });
      if (path === '/api/chat/conversations' && options?.method === 'POST') {
        rows.set(conversation.id, { ...conversation, tool_settings: { ...settings.tool_defaults } });
        return jsonResponse(rows.get(conversation.id));
      }
      if (path === '/api/chat/stream') return new Response('', { headers: { 'X-Run-ID': 'run-tools' } });
      for (const [id, row] of rows) {
        if (path === `/api/chat/conversations/${id}/usage`) return new Response(null, { status: 404 });
        if (path.startsWith(`/api/chat/conversations/${id}/messages`)) return jsonResponse(history(row));
        if (path === `/api/chat/conversations/${id}` && options?.method === 'PATCH') {
          const patch = JSON.parse(String(options.body));
          const updated = { ...row, tool_settings: { ...row.tool_settings, ...patch.tool_settings } };
          rows.set(id, updated);
          return jsonResponse(updated);
        }
      }
      throw new Error(`Unexpected request: ${path}`);
    };
    apiFetchMock.mockImplementation(handle);
    return { rows, handle, history };
  }

  it('waits for a confirmed toggle before allowing a dependent send, including same-tick calls', async () => {
    const server = configureTools([{ ...conversation, tool_settings: { web_search: false } }]);
    const pending = deferred<Response>();
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => options?.method === 'PATCH' ? pending.promise : server.handle(path, options));
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    let saving!: Promise<void>;
    await act(async () => {
      saving = result.current.setConversationTool('web_search', true);
      await expect(result.current.append('Wait for tools')).rejects.toThrow('finish saving');
    });
    expect(result.current.selectedToolSettings.web_search).toBe(false);
    expect(result.current.isSavingConversationTools).toBe(true);
    expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/chat/stream')).toBe(false);
    await act(async () => {
      const updated = { ...conversation, tool_settings: { web_search: true } };
      server.rows.set(conversation.id, updated);
      pending.resolve(jsonResponse(updated));
      await saving;
    });
    expect(result.current.selectedToolSettings.web_search).toBe(true);
    await act(async () => { await result.current.append('Now send'); });
    expect(apiFetchMock.mock.calls.some(([path]) => path === '/api/chat/stream')).toBe(true);
  });

  it('keeps the confirmed choice on failure and reloads authoritative settings on retry', async () => {
    const server = configureTools([{ ...conversation, tool_settings: { web_search: false } }]);
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => options?.method === 'PATCH'
      ? Promise.resolve(new Response(JSON.stringify({ detail: 'Write denied' }), { status: 403 })) : server.handle(path, options));
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    await act(async () => { await result.current.setConversationTool('web_search', true); });
    expect(result.current.selectedToolSettings.web_search).toBe(false);
    expect(result.current.toolSettingsError).toBe('Write denied');
    expect(result.current.isSavingConversationTools).toBe(false);
    await act(async () => { await result.current.retryToolSettings(); });
    expect(result.current.toolSettingsError).toBeNull();
    expect(result.current.selectedToolSettings.web_search).toBe(false);
  });

  it('creates a draft only when needed and preserves explicit off when reusing it', async () => {
    configureTools([]);
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    await act(async () => { await result.current.preferences.saveSettings({ tool_defaults: { web_search: true } }); });
    expect(result.current.selectedToolSettings.web_search).toBe(true);
    await act(async () => { await result.current.setConversationTool('web_search', false); });
    expect(result.current.selectedConversationId).toBe(conversation.id);
    expect(result.current.selectedToolSettings.web_search).toBe(false);
    await act(async () => { await result.current.createConversation(); });
    expect(result.current.selectedToolSettings.web_search).toBe(false);
    expect(apiFetchMock.mock.calls.filter(([path, options]) => path === '/api/chat/conversations' && options?.method === 'POST')).toHaveLength(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/api/chat/conversations/conversation-1', expect.objectContaining({ body: JSON.stringify({ tool_settings: { web_search: false } }) }));
  });

  it('scopes an in-flight save to its original chat and restores that choice on remount', async () => {
    const second = { ...conversation, id: 'conversation-2', tool_settings: { web_search: false } };
    const server = configureTools([{ ...conversation, tool_settings: { web_search: false } }, second]);
    const pending = deferred<Response>();
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => options?.method === 'PATCH' ? pending.promise : server.handle(path, options));
    const { result, unmount } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    let saving!: Promise<void>;
    act(() => { saving = result.current.setConversationTool('web_search', true); });
    act(() => result.current.selectConversation(second.id));
    await waitFor(() => expect(result.current.selectedConversation?.id).toBe(second.id));
    expect(result.current.isSavingConversationTools).toBe(false);
    await act(async () => {
      const updated = { ...conversation, tool_settings: { web_search: true } };
      server.rows.set(conversation.id, updated);
      pending.resolve(jsonResponse(updated));
      await saving;
    });
    expect(result.current.selectedConversationId).toBe(second.id);
    expect(result.current.selectedToolSettings.web_search).toBe(false);
    act(() => result.current.selectConversation(conversation.id));
    await waitFor(() => expect(result.current.selectedToolSettings.web_search).toBe(true));
    unmount();
    const restored = renderHook(() => useChat());
    await waitFor(() => expect(restored.result.current.selectedToolSettings.web_search).toBe(true));
  });

  it.each([false, true])('refreshes effective defaults without replacing active output (explicit choice: %s)', async (explicit) => {
    const initial = { ...conversation, tool_settings: { web_search: false }, run_status: 'running' as const, active_run_id: 'existing-run' };
    const server = configureTools([initial]);
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    const messages = result.current.messages;
    server.rows.set(conversation.id, { ...initial, tool_settings: { web_search: !explicit } });
    await act(async () => { expect(await result.current.preferences.saveSettings({ tool_defaults: { web_search: true } })).toBe(true); });
    expect(result.current.selectedToolSettings.web_search).toBe(!explicit);
    expect(result.current.messages).toBe(messages);
    expect(result.current.isLoading).toBe(true);
    expect(apiFetchMock.mock.calls.filter(([path]) => path === '/api/chat/conversations/conversation-1/messages')).toHaveLength(1);
  });

  it('does not let a late history response undo a newer confirmed tool choice', async () => {
    const original = { ...conversation, tool_settings: { web_search: false } };
    const server = configureTools([original]);
    const history = deferred<Response>();
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => path === '/api/chat/conversations/conversation-1/messages' ? history.promise : server.handle(path, options));
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    await act(async () => { await result.current.setConversationTool('web_search', true); });
    expect(result.current.selectedToolSettings.web_search).toBe(true);
    await act(async () => { history.resolve(jsonResponse(server.history(original))); });
    expect(result.current.selectedToolSettings.web_search).toBe(true);
  });

  it.each([200, 503])('ignores stale cached-chat refresh values/errors after a global save (status: %s)', async (status) => {
    const original = { ...conversation, tool_settings: { web_search: false } };
    const server = configureTools([original]);
    const { result } = renderHook(() => useChat());
    await waitFor(() => expect(result.current.isLoadingConversationTools).toBe(false));
    await waitFor(() => expect(apiFetchMock.mock.calls.some(([path]) => path.endsWith('/usage'))).toBe(true));
    const stale = deferred<Response>();
    let refreshes = 0;
    apiFetchMock.mockImplementation((path: string, options?: RequestInit) => path.endsWith('/messages?limit=1') && ++refreshes === 1 ? stale.promise : server.handle(path, options));
    act(() => result.current.selectConversation(conversation.id));
    server.rows.set(conversation.id, { ...original, tool_settings: { web_search: true } });
    await act(async () => { await result.current.preferences.saveSettings({ tool_defaults: { web_search: true } }); });
    await act(async () => { stale.resolve(new Response(JSON.stringify(status === 200 ? server.history(original) : { detail: 'Obsolete read failed' }), { status })); });
    expect(result.current.selectedToolSettings.web_search).toBe(true);
    expect(result.current.toolSettingsError).toBeNull();
  });
});
