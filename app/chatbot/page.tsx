'use client';

import { useEffect, useRef, useState } from 'react';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import { MessageList } from '@/components/MessageList';
import { ModelSelector } from '@/components/ModelSelector';
import { SettingsPanel } from '@/components/SettingsPanel';
import { DEFAULT_MODEL } from '@/lib/types';
import { useChat } from '@/lib/useChat';

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export default function ChatPage() {
  const chat = useChat({ returnReasoning: true, returnFuncCallInfo: true });
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isMobileInputMode, setIsMobileInputMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem('homechat:sidebar:collapsed');
    setSidebarCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    if (!chat.models.includes(selectedModel)) {
      setSelectedModel(chat.models[0] ?? DEFAULT_MODEL);
    }
  }, [chat.models, selectedModel]);

  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 16;
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;
    const onScroll = () => {
      const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 16;
      setShowScrollToBottom(!atBottom);
    };
    onScroll();
    element.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      element.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maximumHeight = 160;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maximumHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maximumHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  useEffect(() => {
    const checkInputMode = () => {
      setIsMobileInputMode(window.matchMedia('(hover: none) and (pointer: coarse)').matches);
    };
    checkInputMode();
    window.addEventListener('resize', checkInputMode);
    window.addEventListener('orientationchange', checkInputMode);
    return () => {
      window.removeEventListener('resize', checkInputMode);
      window.removeEventListener('orientationchange', checkInputMode);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || chat.isLoading) return;
    setInput('');
    await chat.append(message, selectedModel);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.key === 'Process' || isMobileInputMode) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit(event as unknown as React.FormEvent);
    }
  };

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const changeCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    window.localStorage.setItem('homechat:sidebar:collapsed', String(collapsed));
  };

  return (
    <div className="flex h-screen min-w-0 overflow-hidden bg-white dark:bg-[#212121]">
      <ConversationSidebar
        conversations={chat.conversations}
        selectedConversationId={chat.selectedConversationId}
        streamingByConversation={chat.streamingByConversation}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        hasMore={chat.hasMoreConversations}
        isLoadingMore={chat.isLoadingMore}
        onCreate={() => runAction(async () => { await chat.createConversation(selectedModel); })}
        onSelect={chat.selectConversation}
        onRename={chat.renameConversation}
        onDelete={chat.deleteConversation}
        onLoadMore={() => runAction(chat.loadMoreConversations)}
        onCollapsedChange={changeCollapsed}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 md:px-5 dark:border-zinc-700 dark:bg-[#212121]">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open conversation sidebar"
              title="Conversations"
              onClick={() => setMobileSidebarOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 md:hidden dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <MenuIcon />
            </button>
            <h1 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
              {chat.selectedConversation?.title ?? 'Pikachu HomeAI'}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void runAction(async () => {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                window.location.href = '/login';
              })}
              className="rounded-md px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
            >
              Logout
            </button>
            <SettingsPanel />
          </div>
        </header>

        <main ref={mainRef} className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 py-5 sm:px-5" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
          <div className="mx-auto w-full min-w-0 max-w-4xl lg:max-w-5xl">
            {chat.isInitializing ? (
              <p className="mt-24 text-center text-sm text-zinc-400">Loading conversations...</p>
            ) : chat.messages.length === 0 ? (
              <div className="mx-auto mt-20 max-w-lg text-center">
                <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">What can I help with?</h2>
              </div>
            ) : (
              <MessageList messages={chat.messages} isLoading={chat.isLoading} />
            )}
            {(chat.error || actionError) && (
              <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {chat.error ?? actionError}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {showScrollToBottom && chat.messages.length > 0 && (
            <button
              type="button"
              aria-label="Scroll to latest message"
              title="Scroll to latest"
              onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
              className="fixed bottom-24 right-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white shadow-lg hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 sm:right-6 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" /></svg>
            </button>
          )}
        </main>

        <footer className="shrink-0 border-t border-zinc-200 bg-white px-3 py-3 sm:px-5 dark:border-zinc-700 dark:bg-[#212121]">
          <form
            onSubmit={handleSubmit}
            className="mx-auto w-full max-w-4xl rounded-2xl border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-zinc-400 lg:max-w-5xl dark:border-zinc-600 dark:bg-[#2f2f2f]"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              onInput={adjustTextareaHeight}
              placeholder="Message Pikachu HomeAI"
              enterKeyHint={isMobileInputMode ? 'enter' : 'send'}
              rows={1}
              className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-2 text-sm text-zinc-950 focus:outline-none dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            <div className="flex items-center justify-end gap-1">
              <ModelSelector
                models={chat.models}
                selectedModel={selectedModel}
                onSelect={setSelectedModel}
              />
              <button
                type="submit"
                disabled={chat.isLoading || !input.trim()}
                className="h-10 shrink-0 rounded-lg bg-zinc-900 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {chat.isLoading ? 'Working...' : 'Send'}
              </button>
            </div>
          </form>
        </footer>
      </div>
    </div>
  );
}
