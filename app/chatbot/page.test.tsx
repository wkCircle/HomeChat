import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPage from './page';

const api = vi.hoisted(() => vi.fn());
const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
vi.mock('@/lib/api', async (original) => ({ ...await original<typeof import('@/lib/api')>(), default: api }));
vi.mock('@/components/MessageList', () => ({ MessageList: () => <div>Messages</div> }));
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
