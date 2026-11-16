import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from './page';

const api = vi.hoisted(() => vi.fn());
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
vi.mock('@/lib/api', async (original) => ({ ...await original<typeof import('@/lib/api')>(), default: api }));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <img alt={alt} /> }));
const json = (value: unknown) => new Response(JSON.stringify(value));
const conversation = { id: 'chat-1', title: 'New chat', pinned: false, tool_settings: { web_search: false }, run_status: null, active_run_id: null, created_at: '', updated_at: '', last_message_at: null };

beforeEach(() => {
  window.history.replaceState(null, '', '/chatbot');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  api.mockReset();
  api.mockImplementation(async (path: string) => {
    if (path === '/api/chat/settings') return json({ theme: 'light', font_size: 'medium', tool_defaults: { web_search: false }, created_at: null, updated_at: null });
    if (path === '/api/chat/tools') return json({ tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] });
    if (path === '/api/chat/models') return json({ models: [], context_windows: {}, pricing: {} });
    if (path === '/api/chat/conversations?limit=20') return json({ conversations: [conversation], next_cursor: null });
    if (path === '/api/chat/conversations/chat-1/messages') return json({ conversation, messages: [], truncated: false });
    if (path === '/api/chat/conversations/chat-1/usage') return new Response(null, { status: 404 });
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => {
  if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor);
  else Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  vi.unstubAllGlobals(); vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); document.documentElement.style.fontSize = ''; });

describe('chat preferences wiring', () => {
  it('mounts global Settings and disables Send during a chat-scoped save without losing draft input', async () => {
    render(<ChatPage />);
    await waitFor(() => expect(screen.queryByText('Loading conversations...')).not.toBeInTheDocument());
    const trigger = screen.getByRole('button', { name: 'Chat tools' });
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Web search' })).toBeEnabled());
    const original = api.getMockImplementation()!;
    let resolve!: (response: Response) => void;
    api.mockImplementation((path: string, options?: RequestInit) => options?.method === 'PATCH'
      ? new Promise<Response>((done) => { resolve = done; }) : original(path));
    const input = screen.getByPlaceholderText('Message Pikachu HomeAI');
    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Web search' }));
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    expect(input).toHaveValue('Keep this draft');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(api.mock.calls.some(([path]) => path === '/api/chat/stream')).toBe(false);
    resolve(json({ ...conversation, tool_settings: { web_search: true } }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled());
    expect(input).toHaveValue('Keep this draft');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('light');
  });
});


it.each([true, false])('keeps history stable and skips JS height measurements with native sizing=%s', async (nativeSizing) => {
  vi.stubGlobal('CSS', { supports: vi.fn(() => nativeSizing) });
  const original = api.getMockImplementation()!;
  const source = { id: 'source', url: 'https://example.com/a', hostname: 'example.com' };
  api.mockImplementation((path: string) => path === '/api/chat/conversations/chat-1/messages'
    ? json({ conversation, truncated: false, messages: [{ id: 'answer', role: 'assistant', status: 'completed', parts: [{
      type: 'text', payload: { text: 'Claim', sources: [source], citations: [{ source_id: 'source', start_index: 0, end_index: 5 }] },
    }] }] }) : original(path));
  const { container } = render(<ChatPage />);
  const citation = await screen.findByRole('button', { name: 'Sources: example.com' });
  const input = screen.getByPlaceholderText('Message Pikachu HomeAI');
  const measure = vi.fn(() => 64);
  Object.defineProperty(input, 'scrollHeight', { configurable: true, get: measure });
  const requests = api.mock.calls.length;
  const observer = new MutationObserver(() => {});
  observer.observe(container.querySelector('.space-y-4')!, { subtree: true, childList: true, attributes: true, characterData: true });
  for (let i = 1; i <= 12; i++) fireEvent.change(input, { target: { value: 'Typing probe'.slice(0, i) } });
  expect(input).toHaveValue('Typing probe');
  expect(measure).toHaveBeenCalledTimes(nativeSizing ? 0 : 12);
  expect(input).toHaveClass('[field-sizing:content]', 'overflow-y-auto');
  if (nativeSizing) expect(input.style.height).toBe('');
  else expect(input).toHaveStyle({ height: '64px', overflowY: 'hidden' });
  expect(api.mock.calls).toHaveLength(requests);
  expect(observer.takeRecords()).toHaveLength(0);
  observer.disconnect();
  expect(screen.getByRole('button', { name: 'Sources: example.com' })).toBe(citation);
});


it.each([true, false])('preserves newlines, shrinking, and height caps with native sizing=%s', async (nativeSizing) => {
  vi.stubGlobal('CSS', { supports: vi.fn(() => nativeSizing) });
  render(<ChatPage />);
  await waitFor(() => expect(screen.queryByText('Loading conversations...')).not.toBeInTheDocument());
  const input = screen.getByPlaceholderText('Message Pikachu HomeAI');
  let contentHeight = 44;
  const measure = vi.fn(() => contentHeight);
  Object.defineProperty(input, 'scrollHeight', { configurable: true, get: measure });
  fireEvent.change(input, { target: { value: 'first' } });
  expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
  contentHeight = 76;
  fireEvent.change(input, { target: { value: 'first\nsecond\n' } });
  expect(input).toHaveValue('first\nsecond\n');
  if (!nativeSizing) expect(input).toHaveStyle({ height: '76px', overflowY: 'hidden' });
  contentHeight = 640;
  fireEvent.change(input, { target: { value: 'line\n'.repeat(30) } });
  if (!nativeSizing) expect(input).toHaveStyle({ height: '160px', overflowY: 'auto' });
  contentHeight = 44;
  fireEvent.change(input, { target: { value: '' } });
  if (!nativeSizing) expect(input).toHaveStyle({ height: '44px', overflowY: 'hidden' });
  else {
    expect(measure).not.toHaveBeenCalled();
    expect(input.style.height).toBe('');
  }
  expect(api.mock.calls.some(([path]) => path === '/api/chat/stream')).toBe(false);
});

it('remeasures the compatibility composer only when its observed width changes', async () => {
  vi.stubGlobal('CSS', { supports: vi.fn(() => false) });
  let resize!: ResizeObserverCallback;
  let activeObserver!: ResizeObserver;
  vi.stubGlobal('ResizeObserver', class implements ResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) { resize = callback; activeObserver = this; }
  });
  const { unmount } = render(<ChatPage />);
  await waitFor(() => expect(screen.queryByText('Loading conversations...')).not.toBeInTheDocument());
  const input = screen.getByPlaceholderText('Message Pikachu HomeAI');
  const measure = vi.fn(() => 80);
  Object.defineProperty(input, 'scrollHeight', { configurable: true, get: measure });
  const entry: ResizeObserverEntry = { target: input, contentRect: new DOMRect(0, 0, 320, 44),
    borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] };
  act(() => resize([entry], activeObserver));
  expect(measure).toHaveBeenCalledTimes(1);
  act(() => resize([{ ...entry, contentRect: new DOMRect(0, 0, 320, 80) }], activeObserver));
  expect(measure).toHaveBeenCalledTimes(1);
  act(() => resize([{ ...entry, contentRect: new DOMRect(0, 0, 200, 80) }], activeObserver));
  expect(measure).toHaveBeenCalledTimes(2);
  expect(activeObserver.observe).toHaveBeenCalledWith(input);
  unmount();
  expect(activeObserver.disconnect).toHaveBeenCalledOnce();
});

it.each([true, false])('uses window resize fallback only without native sizing=%s', async (nativeSizing) => {
  vi.stubGlobal('CSS', { supports: vi.fn(() => nativeSizing) });
  vi.stubGlobal('ResizeObserver', undefined);
  const { unmount } = render(<ChatPage />);
  await waitFor(() => expect(screen.queryByText('Loading conversations...')).not.toBeInTheDocument());
  const input = screen.getByPlaceholderText('Message Pikachu HomeAI');
  const measure = vi.fn(() => 80);
  Object.defineProperty(input, 'scrollHeight', { configurable: true, get: measure });
  fireEvent(window, new Event('resize'));
  expect(measure).toHaveBeenCalledTimes(nativeSizing ? 0 : 1);
  unmount();
  fireEvent(window, new Event('resize'));
  expect(measure).toHaveBeenCalledTimes(nativeSizing ? 0 : 1);
});
