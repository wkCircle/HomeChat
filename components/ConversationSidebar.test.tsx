import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '@/lib/types';
import { ConversationSidebar } from './ConversationSidebar';

const conversation: ConversationSummary = {
  id: 'conversation-1',
  title: 'New chat',
  pinned: false,
  run_status: null,
  active_run_id: null,
  created_at: '2026-08-31T00:00:00Z',
  updated_at: '2026-08-31T00:00:00Z',
  last_message_at: '2026-08-31T00:00:00Z',
};

describe('ConversationSidebar', () => {
  it('opens as a focused mobile drawer and closes from its overlay or Escape', () => {
    const onMobileClose = vi.fn();
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
        onPin={vi.fn()}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={onMobileClose}
      />,
    );

    expect(within(view.container).getByTitle('New conversation')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onMobileClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close conversation sidebar' }));
    expect(onMobileClose).toHaveBeenCalledTimes(2);
  });

  it('exposes desktop collapse without collapsing the mobile drawer width', async () => {
    const user = userEvent.setup();
    const onCollapsedChange = vi.fn();
    const view = render(
      <ConversationSidebar
        conversations={[conversation]}
        selectedConversationId={conversation.id}
        streamingByConversation={{}}
        collapsed
        mobileOpen={false}
        hasMore={false}
        isLoadingMore={false}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onPin={vi.fn()}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={onCollapsedChange}
        onMobileClose={vi.fn()}
      />,
    );

    const sidebar = within(view.container).getByRole('complementary', { name: 'Conversation history' });
    expect(sidebar).toHaveClass('w-72', 'md:w-16', '-translate-x-full', 'md:translate-x-0');
    await user.click(within(view.container).getByRole('button', { name: 'Expand sidebar' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(false);
  });

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
        onPin={vi.fn()}
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
        onPin={vi.fn()}
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

  it('closes an action menu when the user clicks outside its conversation', async () => {
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
        onPin={vi.fn()}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={vi.fn()}
      />,
    );

    const sidebar = within(view.container);
    await user.click(sidebar.getByRole('button', { name: 'Actions for New chat' }));
    expect(sidebar.getByRole('button', { name: 'Rename' })).toBeInTheDocument();

    await user.click(sidebar.getByRole('button', { name: 'New conversation' }));
    expect(sidebar.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
  });

  it('groups pinned conversations and toggles their pin state from the hover control', async () => {
    const user = userEvent.setup();
    const onPin = vi.fn().mockResolvedValue(undefined);
    const pinned = { ...conversation, id: 'conversation-2', title: 'Family plan', pinned: true };
    const view = render(
      <ConversationSidebar
        conversations={[conversation, pinned]}
        selectedConversationId={conversation.id}
        streamingByConversation={{}}
        collapsed={false}
        mobileOpen
        hasMore={false}
        isLoadingMore={false}
        onCreate={vi.fn()}
        onSelect={vi.fn()}
        onRename={vi.fn()}
        onPin={onPin}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={vi.fn()}
      />,
    );

    const sidebar = within(view.container);
    expect(sidebar.getByRole('heading', { name: 'Pinned' })).toBeInTheDocument();
    expect(sidebar.getByRole('heading', { name: 'Recents' })).toBeInTheDocument();
    expect(sidebar.getByRole('button', { name: 'Pin New chat' })).toHaveClass('right-8', 'top-2', 'h-7', 'w-7');
    expect(sidebar.getByRole('button', { name: 'Actions for New chat' })).toHaveClass('right-1', 'top-2', 'h-7', 'w-7');

    await user.click(sidebar.getByRole('button', { name: 'Pin New chat' }));
    await user.click(sidebar.getByRole('button', { name: 'Unpin Family plan' }));

    expect(onPin).toHaveBeenNthCalledWith(1, conversation.id, true);
    expect(onPin).toHaveBeenNthCalledWith(2, pinned.id, false);
  });

  it('offers pinning from the action menu for touch and keyboard users', async () => {
    const user = userEvent.setup();
    const onPin = vi.fn().mockResolvedValue(undefined);
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
        onPin={onPin}
        onDelete={vi.fn()}
        onStop={vi.fn()}
        onLoadMore={vi.fn()}
        onCollapsedChange={vi.fn()}
        onMobileClose={vi.fn()}
      />,
    );

    const sidebar = within(view.container);
    await user.click(sidebar.getByRole('button', { name: 'Actions for New chat' }));
    await user.click(sidebar.getByRole('button', { name: 'Pin' }));

    expect(onPin).toHaveBeenCalledWith(conversation.id, true);
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
        onPin={vi.fn()}
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
