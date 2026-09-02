import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '@/lib/types';
import { ConversationSidebar } from './ConversationSidebar';

const conversation: ConversationSummary = {
  id: 'conversation-1',
  title: 'New chat',
  run_status: null,
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  last_message_at: '2026-08-31T00:00:00Z',
};

describe('ConversationSidebar', () => {
  it('shows compact conversation activity beside the title', () => {
    const view = render(
      <ConversationSidebar
        conversations={[conversation]}
        selectedConversationId={conversation.id}
        streamingByConversation={{}}
        collapsed={false}
        mobileOpen
        hasMore={false}
        isLoadingMore={false}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={vi.fn()}
      />,
    );

    expect(within(view.container).getByText(/(?:m|h|d|w|mon|y)$/)).toBeInTheDocument();
  });

  it('keeps typed text while editing a selected conversation title', async () => {
    const user = userEvent.setup();

    const view = render(
      <ConversationSidebar
        conversations={[conversation]}
        selectedConversationId={conversation.id}
        streamingByConversation={{}}
        collapsed={false}
        mobileOpen
        hasMore={false}
        isLoadingMore={false}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={vi.fn()}
      />,
    );

    const sidebar = within(view.container);
    await user.click(sidebar.getByRole('button', { name: 'Actions for New chat' }));
    await user.click(sidebar.getByRole('button', { name: 'Rename' }));

    const titleInput = sidebar.getByRole('textbox', { name: 'Title' });
    await user.keyboard('hello');

    expect(titleInput).toHaveValue('hello');
  });

  it('stops the selected active conversation from its action menu', async () => {
    const user = userEvent.setup();
    const onStop = vi.fn().mockResolvedValue(undefined);
    const running = { ...conversation, run_status: 'running' as const };
    const view = render(
      <ConversationSidebar
        conversations={[running]}
        selectedConversationId={running.id}
        streamingByConversation={{ [running.id]: true }}
        collapsed={false}
        mobileOpen
        hasMore={false}
        isLoadingMore={false}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onStop={onStop}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={vi.fn()}
      />,
    );

    const sidebar = within(view.container);
    await user.click(sidebar.getByRole('button', { name: 'Actions for New chat' }));
    await user.click(sidebar.getByRole('button', { name: 'Stop' }));

    expect(onStop).toHaveBeenCalledWith(running.id);
  });
});
