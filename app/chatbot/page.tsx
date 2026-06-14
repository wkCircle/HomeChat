"use client";

import { useEffect, useRef, useState } from 'react';
import { MessageList } from '@/components/MessageList';
import { SettingsPanel } from '@/components/SettingsPanel';
import { useChat } from '@/lib/useChat';

export default function ChatPage() {
  const { messages, isLoading, error, append, reset } = useChat({
    model: 'gpt-5.1',
    returnReasoning: true,
    returnFuncCallInfo: true,
  });

  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || isLoading) return;
    setInput('');
    await append(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-lg font-semibold text-indigo-600">Pikachu HomeAI</h1>
        <div className="flex items-center gap-2">
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
      <main className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl">
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
      </main>

      {/* Input */}
      <footer className="border-t bg-white px-4 py-4 dark:border-gray-700 dark:bg-gray-800">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Pikachu HomeAI… (Enter to send, Shift+Enter for newline)"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-40"
          >
            {isLoading ? '…' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}
