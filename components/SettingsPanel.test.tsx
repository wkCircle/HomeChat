import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserSettingsController } from '@/lib/useUserSettings';
import { SettingsPanel } from './SettingsPanel';

function controller(overrides: Partial<UserSettingsController> = {}): UserSettingsController {
  return {
    settings: { theme: 'dark', font_size: 'large', tool_defaults: { web_search: false }, created_at: null, updated_at: null },
    tools: [{ id: 'web_search', label: 'Web search', description: 'Search public sources.', kind: 'provider', provider: 'openai' }],
    isLoadingSettings: false, isSavingSettings: false, error: null,
    saveSettings: vi.fn(async () => true), reloadSettings: vi.fn(async () => {}), isSaving: () => false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { vi.unstubAllGlobals(); document.documentElement.classList.remove('dark'); document.documentElement.style.fontSize = ''; });

describe('SettingsPanel', () => {
  it('renders confirmed General values and saves partial global tool defaults', () => {
    const preferences = controller();
    render(<SettingsPanel preferences={preferences} />);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.fontSize).toBe('17px');
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('dark');
    fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: 'light' } });
    expect(preferences.saveSettings).toHaveBeenCalledWith({ theme: 'light' });
    fireEvent.click(screen.getByRole('button', { name: 'Decrease font size' }));
    expect(preferences.saveSettings).toHaveBeenCalledWith({ font_size: 'medium' });
    fireEvent.click(screen.getByRole('button', { name: 'tools' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Default Web search' }));
    expect(preferences.saveSettings).toHaveBeenCalledWith({ tool_defaults: { web_search: true } });
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.queryByText(/execution is not active/i)).not.toBeInTheDocument();
  });

  it('traps keyboard focus, dismisses with Escape and restores scroll/focus', () => {
    document.body.style.overflow = 'auto';
    render(<SettingsPanel preferences={controller()} />);
    const trigger = screen.getByRole('button', { name: 'Settings' });
    trigger.focus(); fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close settings' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'large' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe('auto');
    document.body.style.overflow = '';
  });

  it('disables unknown or pending settings and exposes an explicit retry', () => {
    const preferences = controller({ settings: null, error: 'Settings unavailable' });
    const { rerender } = render(<SettingsPanel preferences={preferences} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Settings unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading settings' }));
    expect(preferences.reloadSettings).toHaveBeenCalledOnce();
    rerender(<SettingsPanel preferences={controller({ isSavingSettings: true })} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Saving settings');
    fireEvent.click(screen.getByRole('button', { name: 'tools' }));
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});
