import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUserSettings } from './useUserSettings';

const api = vi.hoisted(() => vi.fn());
vi.mock('./api', async (original) => ({ ...await original<typeof import('./api')>(), default: api }));
const defaults = { theme: 'dark', font_size: 'large', tool_defaults: { web_search: false }, created_at: null, updated_at: null };
const catalog = { tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

beforeEach(() => {
  api.mockReset();
  api.mockImplementation((path: string) => Promise.resolve(json(path === '/api/chat/tools' ? catalog : defaults)));
});

describe('durable user settings', () => {
  it('loads settings and tool metadata from the authenticated API', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.isLoadingSettings).toBe(false));
    expect(result.current.settings).toEqual(defaults);
    expect(result.current.tools).toEqual(catalog.tools);
  });

  it('keeps confirmed values and blocks another save while a patch is pending', async () => {
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    let resolve!: (response: Response) => void;
    api.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    let save!: Promise<boolean>;
    act(() => { save = result.current.saveSettings({ tool_defaults: { web_search: true } }); });
    expect(result.current.settings?.tool_defaults.web_search).toBe(false);
    expect(result.current.isSaving()).toBe(true);
    await act(async () => { expect(await result.current.saveSettings({ theme: 'light' })).toBe(false); });
    expect(api.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
    await act(async () => { resolve(json({ ...defaults, tool_defaults: { web_search: true } })); await save; });
    expect(result.current.settings?.tool_defaults.web_search).toBe(true);
    expect(api.mock.calls.at(-1)?.[1]?.body).toBe(JSON.stringify({ tool_defaults: { web_search: true } }));
  });

  it('surfaces load/save failures, retries loading and never substitutes success defaults', async () => {
    api.mockResolvedValue(json({ detail: 'Settings unavailable' }, 503));
    const { result } = renderHook(() => useUserSettings());
    await waitFor(() => expect(result.current.error).toContain('Settings unavailable'));
    expect(result.current.settings).toBeNull();
    api.mockImplementation((path: string) => Promise.resolve(json(path === '/api/chat/tools' ? catalog : defaults)));
    await act(async () => { await result.current.reloadSettings(); });
    api.mockResolvedValue(json({ detail: 'Write denied' }, 403));
    await act(async () => { expect(await result.current.saveSettings({ theme: 'light' })).toBe(false); });
    expect(result.current.settings?.theme).toBe('dark');
    expect(result.current.error).toContain('Write denied');
  });
});
