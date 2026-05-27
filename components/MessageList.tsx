'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StreamTypeEnum } from '@/lib/types';
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

function ReasoningBlock({ text }: { text: string }) {
  return (
    <details className="my-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium text-purple-700 select-none">
        💭 Reasoning
      </summary>
      <p className="mt-2 whitespace-pre-wrap text-purple-900">{text}</p>
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
          <pre className="mt-1 max-h-32 overflow-auto rounded bg-gray-100 p-2 text-gray-600">
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
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-100 p-2 text-gray-700">
        {typeof part.content === 'string' ? part.content : JSON.stringify(part.content, null, 2)}
      </pre>
    </details>
  );
}

function ArtifactBlock({ part }: { part: UIPart | InteractivePart }) {
  // Placeholder — swap with your own component once you know the artifact shape.
  return (
    <details className="my-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-blue-700 select-none">
        {part.type === StreamTypeEnum.INTERACTIVE ? '🖱 Interactive block' : '📊 UI block'}
      </summary>
      <pre className="mt-1 max-h-60 overflow-auto text-blue-900">
        {JSON.stringify(part.artifact, null, 2)}
      </pre>
    </details>
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

function AssistantMessage({ msg, isLoading }: { msg: ChatMessage; isLoading?: boolean }) {
  // Build set of tool_call_ids that have a matching func_call_end part
  const resolvedIds = new Set(
    msg.parts
      .filter((p): p is FuncCallEndPart => p.type === StreamTypeEnum.FUNC_CALL_END)
      .map((p) => p.tool_call_id),
  );

  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
        AI
      </div>
      <div className="max-w-2xl space-y-1">
        {msg.parts.map((part, i) => {
          switch (part.type) {
            case StreamTypeEnum.TEXT:
              return (
                <div key={i} className="prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
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
      <div className="max-w-xl rounded-2xl bg-indigo-500 px-4 py-2 text-sm text-white">
        {text}
      </div>
    </div>
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function MessageList({ messages, isLoading }: { messages: ChatMessage[]; isLoading?: boolean }) {
  return (
    <div className="space-y-4">
      {messages.map((msg, i) => {
        const isLastMsg = i === messages.length - 1;
        return msg.role === 'user' ? (
          <UserMessage key={msg.id} msg={msg} />
        ) : (
          <AssistantMessage key={msg.id} msg={msg} isLoading={isLastMsg ? isLoading : false} />
        );
      })}
    </div>
  );
}
