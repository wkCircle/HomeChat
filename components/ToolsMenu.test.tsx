import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToolsMenu } from './ToolsMenu';

const tools = [{ id: 'web_search' as const, label: 'Web search', description: 'Search public sources.', kind: 'provider' as const, provider: 'openai' }];
function props() {
  return { tools, preferences: { web_search: false }, isLoading: false, isSaving: false, error: null, onToggle: vi.fn(), onRetry: vi.fn() };
}
describe('chat Tools menu', () => {
  it('shows confirmed settings and calls a chat-scoped toggle without a stale inactive-execution warning', () => {
    const options = props();
    render(<ToolsMenu {...options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat tools' }));
    const toggle = screen.getByRole('switch', { name: 'Web search' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(options.onToggle).toHaveBeenCalledWith('web_search', true);
    expect(screen.queryByText(/execution is not active/i)).not.toBeInTheDocument();
  });
  it('disables writes while saving and shows errors with retry', () => {
    const options = props();
    render(<ToolsMenu {...options} isSaving error="Unable to save tools" />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat tools' }));
    expect(screen.getByRole('switch', { name: 'Web search' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to save tools');
  });
  it('allows retry after loading failed even when confirmed settings are unavailable', () => {
    const options = props();
    render(<ToolsMenu {...options} isLoading error="Settings unavailable" />);
    fireEvent.click(screen.getByRole('button', { name: 'Chat tools' }));
    expect(screen.getByRole('switch')).toBeDisabled();
    const retry = screen.getByRole('button', { name: 'Retry loading settings' });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(options.onRetry).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('closes on Escape and restores focus to its trigger', () => {
    render(<ToolsMenu {...props()} />);
    const trigger = screen.getByRole('button', { name: 'Chat tools' });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
