import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationHistory, ConversationPage, ConversationSummary } from './types';
import { useChat } from './useChat';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('./api', () => ({ default: apiFetchMock }));

const conversation: ConversationSummary = {
  id: 'conversation-1',
  title: 'New chat',
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
    if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-5.1'] }));
    if (path === '/api/chat/conversations?limit=20') {
      const page: ConversationPage = { conversations: [history.conversation], next_cursor: null };
      return Promise.resolve(jsonResponse(page));
    }
    if (path === '/api/chat/conversations/conversation-1/messages') {
      return Promise.resolve(jsonResponse(history));
    }
    throw new Error(`Unexpected request: ${path}`);
  });
}

describe('useChat stop behavior', () => {
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
      if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-5.1'] }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({ conversations: [conversation], next_cursor: null }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages') {
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
      if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-5.1'] }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({
          conversations: [runningConversation], next_cursor: null,
        }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages') return lateHistory.promise;
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
      if (path === '/api/chat/models') return Promise.resolve(jsonResponse({ models: ['gpt-5.1'] }));
      if (path === '/api/chat/conversations?limit=20') {
        return Promise.resolve(jsonResponse({
          conversations: [runningConversation], next_cursor: null,
        }));
      }
      if (path === '/api/chat/conversations/conversation-1/messages') {
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