'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConversationSummary } from '@/lib/types';

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  selectedConversationId: string | null;
  streamingByConversation: Record<string, boolean>;
  collapsed: boolean;
  mobileOpen: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onCreate: () => Promise<void>;
  onSelect: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => Promise<void>;
  onDelete: (conversationId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
  onCollapsedChange: (collapsed: boolean) => void;
  onMobileClose: () => void;
}

function Icon({ name }: { name: 'add' | 'collapse' | 'expand' | 'more' | 'chat' }) {
  const paths = {
    add: <path d="M12 5v14M5 12h14" />,
    collapse: <path d="m15 18-6-6 6-6" />,
    expand: <path d="m9 18 6-6-6-6" />,
    more: <path d="M12 6.5h.01M12 12h.01M12 17.5h.01" strokeWidth="3" />,
    chat: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {paths[name]}
    </svg>
  );
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const [menuConversationId, setMenuConversationId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { kind: 'rename'; conversation: ConversationSummary; title: string }
    | { kind: 'delete'; conversation: ConversationSummary }
    | null
  >(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const newChatRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.mobileOpen) return;
    newChatRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onMobileClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [props.mobileOpen, props.onMobileClose]);

  useEffect(() => {
    if (!dialog) return;
    if (dialog.kind === 'rename') {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) setDialog(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [dialog, isSubmitting]);

  const openRename = (conversation: ConversationSummary) => {
    setMenuConversationId(null);
    setDialogError(null);
    setDialog({ kind: 'rename', conversation, title: conversation.title });
  };

  const openDelete = (conversation: ConversationSummary) => {
    setMenuConversationId(null);
    setDialogError(null);
    setDialog({ kind: 'delete', conversation });
  };

  const submitDialog = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dialog || isSubmitting) return;
    setDialogError(null);
    setIsSubmitting(true);
    try {
      if (dialog.kind === 'rename') {
        const title = dialog.title.trim();
        if (!title) {
          setDialogError('Enter a conversation title.');
          return;
        }
        if (title !== dialog.conversation.title) {
          await props.onRename(dialog.conversation.id, title);
        }
      } else {
        await props.onDelete(dialog.conversation.id);
      }
      setDialog(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {props.mobileOpen && (
        <button
          type="button"
          aria-label="Close conversation sidebar"
          className="fixed inset-0 z-40 bg-black/35 md:hidden"
          onClick={props.onMobileClose}
        />
      )}
      <aside
        ref={panelRef}
        aria-label="Conversation history"
        className={`fixed inset-y-0 left-0 z-50 flex border-r border-zinc-200 bg-zinc-50 transition-[width,transform] duration-200 dark:border-zinc-800 dark:bg-[#171717] md:relative md:z-20 md:translate-x-0 ${
          props.mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${props.collapsed ? 'w-72 md:w-16' : 'w-72'}`}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className={`flex h-16 items-center border-b border-zinc-200 px-3 dark:border-zinc-700 ${props.collapsed ? 'md:justify-center' : 'justify-between'}`}>
            <span className={`truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100 ${props.collapsed ? 'md:hidden' : ''}`}>
              Pikachu HomeAI
            </span>
            <button
              type="button"
              aria-label={props.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={props.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 md:inline-flex dark:hover:bg-zinc-800"
              onClick={() => props.onCollapsedChange(!props.collapsed)}
            >
              <Icon name={props.collapsed ? 'expand' : 'collapse'} />
            </button>
          </div>

          <div className="p-3">
            <button
              ref={newChatRef}
              type="button"
              onClick={() => void props.onCreate()}
              title="New conversation"
              className={`flex h-10 w-full items-center rounded-md border border-zinc-300 bg-white text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800 ${props.collapsed ? 'md:justify-center md:px-0' : 'gap-2 px-3'}`}
            >
              <Icon name="add" />
              <span className={props.collapsed ? 'md:hidden' : ''}>New conversation</span>
            </button>
          </div>

          <nav className={`min-h-0 flex-1 overflow-y-auto px-2 pb-3 ${props.collapsed ? 'md:px-2' : ''}`} aria-label="Conversations">
            {props.conversations.map((conversation) => {
              const selected = conversation.id === props.selectedConversationId;
              const running = Boolean(props.streamingByConversation[conversation.id]) || conversation.run_status === 'running';
              return (
                <div key={conversation.id} className="relative mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      props.onSelect(conversation.id);
                      props.onMobileClose();
                    }}
                    title={conversation.title}
                    className={`flex h-11 w-full min-w-0 items-center rounded-md text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                      selected
                        ? 'bg-zinc-200 text-zinc-950 dark:bg-zinc-700 dark:text-white'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    } ${props.collapsed ? 'md:justify-center md:px-0' : 'gap-2 pl-3 pr-10'}`}
                  >
                    {running ? (
                      <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500" aria-label="Running" />
                    ) : (
                      <Icon name="chat" />
                    )}
                    <span className={`truncate ${props.collapsed ? 'md:hidden' : ''}`}>{conversation.title}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Actions for ${conversation.title}`}
                    title="Conversation actions"
                    onClick={() => setMenuConversationId((current) => current === conversation.id ? null : conversation.id)}
                    className={`absolute right-1 top-1 h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-600 ${props.collapsed ? 'hidden' : 'flex'}`}
                  >
                    <Icon name="more" />
                  </button>
                  {menuConversationId === conversation.id && (
                    <div className="absolute right-1 top-10 z-30 w-32 overflow-hidden rounded-md border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                      <button type="button" onClick={() => openRename(conversation)} className="block w-full px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700">Rename</button>
                      <button type="button" onClick={() => openDelete(conversation)} className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 dark:hover:bg-zinc-700">Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
            {props.hasMore && !props.collapsed && (
              <button
                type="button"
                disabled={props.isLoadingMore}
                onClick={() => void props.onLoadMore()}
                className="mt-2 w-full rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                {props.isLoadingMore ? 'Loading...' : 'Load more'}
              </button>
            )}
          </nav>
        </div>
      </aside>
      {dialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="conversation-dialog-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) setDialog(null);
          }}
        >
          <form
            onSubmit={submitDialog}
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-700 dark:bg-[#2f2f2f]"
          >
            <h2 id="conversation-dialog-title" className="text-base font-semibold text-zinc-950 dark:text-white">
              {dialog.kind === 'rename' ? 'Rename conversation' : 'Delete conversation'}
            </h2>
            {dialog.kind === 'rename' ? (
              <label className="mt-4 block text-sm text-zinc-600 dark:text-zinc-300">
                Title
                <input
                  ref={renameInputRef}
                  value={dialog.title}
                  maxLength={120}
                  disabled={isSubmitting}
                  onChange={(event) => setDialog({ ...dialog, title: event.target.value })}
                  className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-60 dark:border-zinc-600 dark:bg-[#212121] dark:text-zinc-100"
                />
              </label>
            ) : (
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Permanently delete <strong className="font-semibold text-zinc-900 dark:text-white">{dialog.conversation.title}</strong>? This cannot be undone.
              </p>
            )}
            {dialogError && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{dialogError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDialog(null)}
                className="h-10 rounded-lg px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || (dialog.kind === 'rename' && !dialog.title.trim())}
                className={`h-10 rounded-lg px-4 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                  dialog.kind === 'delete'
                    ? 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400'
                    : 'bg-zinc-900 text-white hover:bg-zinc-700 focus-visible:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white'
                }`}
              >
                {isSubmitting ? 'Saving...' : dialog.kind === 'rename' ? 'Rename' : 'Delete'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
