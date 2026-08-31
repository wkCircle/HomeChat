"use client";

import { useEffect, useRef, useState } from 'react';
import { MessageList } from '@/components/MessageList';
import { SettingsPanel } from '@/components/SettingsPanel';
import { DEFAULT_MODEL } from '@/lib/types';
import { useChat } from '@/lib/useChat';

export default function ChatPage() {
  const { messages, isLoading, error, append, reset } = useChat({
    model: DEFAULT_MODEL,
    returnReasoning: true,
    returnFuncCallInfo: true,
  });

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [isMobileInputMode, setIsMobileInputMode] = useState(false);

  // Auto-scroll to bottom on new content only if already near bottom
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Track scroll to toggle the floating "scroll to bottom" button
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 16;
      setShowScrollToBottom(!atBottom);
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => onScroll();
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll as EventListener);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // Autosize textarea height up to a maximum, then allow internal scrolling
  const adjustTextareaHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const maxHeight = 160; // px, approx 6-8 lines depending on font
    const newHeight = Math.min(ta.scrollHeight, maxHeight);
    ta.style.height = `${newHeight}px`;
    ta.style.overflowY = ta.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  // Detect mobile-like input mode (touch-only pointer). Avoid viewport width heuristics.
  useEffect(() => {
    const check = () => {
      const mobileLike = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      setIsMobileInputMode(Boolean(mobileLike));
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check as any);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check as any);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');
    await append(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e as any).isComposing || e.key === 'Process') {
      // IME composition in progress; let Enter confirm composition
      return;
    }
    if (isMobileInputMode) {
      // On mobile: Enter inserts newline; only button sends
      return;
    } else {
      // Desktop: Enter sends; Shift+Enter newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as React.FormEvent);
      }
    }
  };

  return (
    <div className="flex min-w-0 h-screen flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-3 py-3 shadow-sm sm:px-6 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="min-w-0 text-lg font-semibold text-indigo-600">Pikachu HomeAI</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={reset}
            className="rounded px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            New chat
          </button>
          <button
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
              } finally {
                window.location.href = '/login';
              }
            }}
            className="rounded px-3 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            Logout
          </button>
          <SettingsPanel />
        </div>
      </header>

      {/* Message area */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4 sm:py-6"
        // Improve touch scrolling on mobile; prevent accidental horizontal panning
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
      >
        <div className="mx-auto w-full min-w-0 max-w-4xl lg:max-w-5xl xl:max-w-6xl">
          {messages.length === 0 ? (
            <p className="mt-24 text-center text-gray-400">Ask me anything to get started.</p>
          ) : (
            <MessageList messages={messages} isLoading={isLoading} />
          )}
          {error && (
            <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">⚠ {error}</p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Scroll-to-bottom floating button */}
        {showScrollToBottom && messages.length > 0 && (
          <button
            type="button"
            aria-label="Scroll to latest message"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
            className="fixed right-4 bottom-24 z-30 inline-flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg ring-1 ring-indigo-400/50 hover:bg-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:right-6"
          >
            {/* Down arrow icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        )}
      </main>

      {/* Input */}
      <footer className="border-t bg-white px-3 py-4 sm:px-4 dark:border-gray-700 dark:bg-gray-800">
        <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-4xl flex-col items-stretch gap-2 sm:flex-row sm:items-end lg:max-w-5xl xl:max-w-6xl">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobileInputMode ? 'Message Pikachu HomeAI… (Tap Send to submit; Enter for newline)' : 'Message Pikachu HomeAI… (Enter to send, Shift+Enter for newline)'}
            enterKeyHint={isMobileInputMode ? 'enter' : 'send'}
            rows={1}
            className="h-auto max-h-40 min-h-[44px] w-full resize-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 sm:flex-1 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            onInput={adjustTextareaHeight}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-40 sm:w-auto"
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}
