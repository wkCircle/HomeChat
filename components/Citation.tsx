"use client";

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHoverPreview } from '@/lib/useHoverPreview';
import type { CitationSource } from '@/lib/types';

function SourceIcon({ source, conversationId }: { source: CitationSource; conversationId?: string }) {
  const [failed, setFailed] = useState(false);
  if (!conversationId || failed) return <i aria-hidden="true" className="fa-solid fa-globe text-gray-400" />;
  return <img alt="" width={16} height={16} className="inline-block h-4 w-4 shrink-0" referrerPolicy="no-referrer"
    src={`/api/chat/conversations/${encodeURIComponent(conversationId)}/sources/${encodeURIComponent(source.id)}/favicon`}
    onError={() => setFailed(true)} />;
}

export function CitationGroup({ sources, conversationId }: { sources: CitationSource[]; conversationId?: string }) {
  const preview = useHoverPreview<string>();
  const container = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLSpanElement>(null);
  const ignoreFocus = useRef(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 320 });
  const { active, setActive } = preview;
  const open = active !== null;
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent | PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setActive(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setActive(null); ignoreFocus.current = true; button.current?.focus(); ignoreFocus.current = false;
    };
    document.addEventListener('mousedown', outside); document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside); document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, setActive]);
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = button.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, window.innerWidth - 24);
      const height = Math.min(popup.current?.getBoundingClientRect().height ?? 200, window.innerHeight - 24);
      setPosition({
        left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width,
        top: Math.max(12, Math.min(rect.top > height + 16 ? rect.top - height - 6 : rect.bottom + 6, window.innerHeight - height - 12))
      });
    };
    reposition(); window.addEventListener('resize', reposition); window.addEventListener('scroll', reposition, true);
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true); };
  }, [open]);
  if (sources.length === 0) return null;
  const first = sources[0];
  return <span ref={container} className="not-prose inline-flex align-baseline" onPointerEnter={event => preview.enter('sources', event)}
    onPointerLeave={preview.leave} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setActive(null); }}>
    <button ref={button} type="button" aria-label={`Sources: ${first.hostname}`} aria-haspopup="dialog" aria-expanded={open}
      className="mx-1 inline-flex max-w-48 items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
      onFocus={() => { if (!ignoreFocus.current) preview.focus('sources'); }}
      onPointerDown={event => preview.down('sources', event)} onPointerMove={preview.move}
      onPointerUp={preview.clearTimer} onPointerCancel={preview.clearTimer} onContextMenu={preview.contextMenu}
      onClick={event => { if (preview.consumeLongPress()) event.preventDefault(); else setActive('sources'); }}>
      <SourceIcon source={first} conversationId={conversationId} /><span className="truncate">{first.hostname}</span>
      {sources.length > 1 && <span>{sources.length - 1}+</span>}
    </button>
    {open && <span ref={popup} role="dialog" aria-label="Sources" style={position}
      className="fixed z-50 block max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-xl dark:border-gray-600 dark:bg-gray-800">
      {sources.map((source, index) => <span key={source.id} className="block">
        {index > 0 && <hr className="my-3 border-gray-200 dark:border-gray-600" />}
        <a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="block rounded focus-visible:ring-2 focus-visible:ring-indigo-400">
          <span className="flex items-center gap-2 text-xs text-gray-500"><SourceIcon source={source} conversationId={conversationId} />{source.hostname}</span>
          <span className="mt-1 block font-medium text-gray-800 dark:text-gray-100">{source.title || source.hostname}</span>
          {source.published_at && <time className="block text-xs text-gray-500" dateTime={source.published_at}>{new Date(source.published_at).toLocaleDateString()}</time>}
        </a>
      </span>)}
    </span>}
  </span>;
}
