'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import { StreamTypeEnum } from '@/lib/types';
import ArtifactRenderer from './ArtifactRenderer';
import type {
  ChatMessage,
  FuncCallEndPart,
  FuncCallStartPart,
  InteractivePart,
  MonitorPart,
  UIPart,
} from '@/lib/types';

export type { ChatMessage };

// ─── Part renderers ───────────────────────────────────────────────────────────

function AvatarModal({ open, onClose, src, alt }: { open: boolean; onClose: () => void; src: string; alt: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="relative max-h-[85vh] max-w-[90vw] rounded-xl bg-white/5 p-2 shadow-2xl backdrop-blur dark:bg-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-[min(70vh,560px)] w-[min(90vw,560px)]">
          <Image src={src} alt={alt} fill className="rounded-lg object-contain" priority />
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -right-2 -top-2 rounded-full bg-white p-1 text-gray-700 shadow dark:bg-gray-800 dark:text-gray-200"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function ReasoningBlock({ text }: { text: string }) {
  return (
    <details className="my-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-purple-700 select-none">
        💭 Reasoning
      </summary>
      <p className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-purple-900">{text}</p>
    </details>
  );
}

function FuncCallStartBlock({ part, isResolved }: { part: FuncCallStartPart; isResolved: boolean }) {
  const calls = Object.values(part.calls) as { name?: string; args?: Record<string, unknown> }[];
  return (
    <div className="my-1 space-y-0.5 text-xs text-gray-400">
      {calls.map((c, i) => (
        <details key={i} className="rounded border border-gray-200 bg-gray-50 px-2 py-1">
          <summary className="cursor-pointer select-none">
            {isResolved ? `Called ${c.name ?? 'unknown'}` : `Calling ${c.name ?? 'unknown'}…`}
          </summary>
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-gray-600">
            {JSON.stringify(c.args ?? {}, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}

function FuncCallEndBlock({ part }: { part: FuncCallEndPart }) {
  const icon = part.status === 'success' ? '✓' : '✗';
  const color = part.status === 'success' ? 'text-green-700' : 'text-red-700';
  return (
    <details className="my-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs">
      <summary className={`cursor-pointer font-medium select-none ${color}`}>
        {icon} {part.name} — {part.status}
      </summary>
      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-100 p-2 text-gray-700">
        {typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2)}
      </pre>
    </details>
  );
}

function ArtifactBlock({ part }: { part: UIPart | InteractivePart }) {
  return (
    <div className="my-2">
      <ArtifactRenderer artifact={part.artifact} kind={part.type} />
    </div>
  );
}

function MonitorBlock({ part }: { part: MonitorPart }) {
  const { input_tokens, output_tokens, total_tokens } = part.usage as Record<string, number>;
  return (
    <div className="mt-1 text-right text-[10px] text-gray-400">
      tokens ↑{input_tokens ?? '?'} ↓{output_tokens ?? '?'} ={total_tokens ?? '?'}
    </div>
  );
}

// ─── Single message ───────────────────────────────────────────────────────────

function AssistantMessage({ msg, isLoading, onAvatarClick }: { msg: ChatMessage; isLoading?: boolean; onAvatarClick?: () => void }) {
  // Build set of tool_call_ids that have a matching func_call_end part
  const resolvedIds = new Set(
    msg.parts
      .filter((p): p is FuncCallEndPart => p.type === StreamTypeEnum.FUNC_CALL_END)
      .map((p) => p.tool_call_id),
  );

  return (
    <div className="flex min-w-0 gap-3">
      <button
        type="button"
        onClick={onAvatarClick}
        className="mt-1 h-7 w-7 shrink-0 overflow-hidden rounded-full bg-indigo-100 ring-1 ring-transparent outline-none transition focus-visible:ring-indigo-400"
        aria-label="View agent portrait"
      >
        <Image src="/avatars/pikachu_redsofa_2.jpeg" alt="Agent portrait" width={28} height={28} className="h-full w-full object-cover" priority />
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        {msg.parts.map((part, i) => {
          switch (part.type) {
            case StreamTypeEnum.TEXT:
              return (
                <div key={i} className="prose prose-sm min-w-0 max-w-full break-words dark:prose-invert prose-pre:whitespace-pre-wrap">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}
                  >
                    {part.text}
                  </ReactMarkdown>
                </div>
              );
            case StreamTypeEnum.REASONING:
              return <ReasoningBlock key={i} text={part.text} />;
            case StreamTypeEnum.FUNC_CALL_START: {
              // Resolved when stream is done OR every call ID has a matching func_call_end
              const callIds = Object.values(part.calls).map((c) => (c as { id?: string }).id ?? '');
              const isResolved = !isLoading || callIds.every((id) => id && resolvedIds.has(id));
              return <FuncCallStartBlock key={i} part={part} isResolved={isResolved} />;
            }
            case StreamTypeEnum.FUNC_CALL_END:
              return <FuncCallEndBlock key={i} part={part} />;
            case StreamTypeEnum.UI:
            case StreamTypeEnum.INTERACTIVE:
              return <ArtifactBlock key={i} part={part} />;
            case StreamTypeEnum.MONITOR:
              return <MonitorBlock key={i} part={part} />;
            case StreamTypeEnum.ERROR:
              return (
                <p key={i} className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                  ⚠ {part.message}
                </p>
              );
            default:
              return null;
          }
        })}
        {msg.parts.length === 0 && isLoading && (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-400">
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.3s]" />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.15s]" />
            <span className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400" />
            <span className="text-gray-400">Working…</span>
          </span>
        )}
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: ChatMessage }) {
  const text = msg.parts.find((p) => p.type === 'text')?.text ?? '';
  return (
    <div className="flex justify-end">
      <div className="max-w-full sm:max-w-xl rounded-2xl bg-indigo-500 px-4 py-2 text-sm text-white break-words whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function MessageList({ messages, isLoading }: { messages: ChatMessage[]; isLoading?: boolean }) {
  const [isAvatarOpen, setIsAvatarOpen] = useState(false);
  return (
    <div className="space-y-4">
      {messages.map((msg, i) => {
        const isLastMsg = i === messages.length - 1;
        return msg.role === 'user' ? (
          <UserMessage key={msg.id} msg={msg} />
        ) : (
          <AssistantMessage
            key={msg.id}
            msg={msg}
            isLoading={isLastMsg ? isLoading : false}
            onAvatarClick={() => setIsAvatarOpen(true)}
          />
        );
      })}
      <AvatarModal
        open={isAvatarOpen}
        onClose={() => setIsAvatarOpen(false)}
        src="/avatars/pikachu_redsofa_2.jpeg"
        alt="Agent portrait large"
      />
    </div>
  );
}
