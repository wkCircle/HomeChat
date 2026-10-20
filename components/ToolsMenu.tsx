'use client';

import { useEffect, useRef, useState } from 'react';
import type { ToolDefinition, ToolId, ToolPreferences } from '@/lib/types';

interface ToolsMenuProps {
  tools: ToolDefinition[];
  preferences: ToolPreferences;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onToggle: (id: ToolId, enabled: boolean) => void;
  onRetry: () => void;
}

export function ToolsMenu({ tools, preferences, isLoading, isSaving, error, onToggle, onRetry }: ToolsMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const enabled = tools.some((tool) => preferences[tool.id] === true);
  return (
    <div className="relative shrink-0" ref={root} onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button ref={trigger} type="button" aria-label="Chat tools" title="Chat tools" aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${enabled ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-600'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></svg>
        <span className="hidden sm:inline">Tools</span>
        {enabled && <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-label="Tools enabled" />}
      </button>
      {open && <div ref={panel} tabIndex={-1} role="dialog" aria-label="Chat tools"
        className="absolute bottom-12 left-0 z-40 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl focus:outline-none dark:border-gray-600 dark:bg-gray-800">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Tools for this chat</h2>
        {isLoading && !error && <p role="status" className="text-sm text-gray-500">Loading tool settings...</p>}
        {tools.map((tool) => <div key={tool.id} className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0"><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool.label}</span>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tool.description}</p></div>
          <button type="button" role="switch" aria-label={tool.label} aria-checked={preferences[tool.id] === true}
            disabled={isLoading || isSaving} onClick={() => onToggle(tool.id, !preferences[tool.id])}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50 ${preferences[tool.id] ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${preferences[tool.id] ? 'left-0.5 translate-x-5' : 'left-0.5'}`} />
          </button>
        </div>)}
        {isSaving && <p role="status" className="mb-2 text-xs text-gray-500">Saving tool settings...</p>}
        {error && <div className="mb-2 text-xs text-red-600 dark:text-red-300"><p role="alert">{error}</p>
          <button type="button" disabled={isSaving || (isLoading && !error)} onClick={onRetry} className="mt-1 underline disabled:opacity-50">Retry loading settings</button></div>}
        <p className="text-xs text-gray-500 dark:text-gray-400">Changes apply to your next prompt, not an active response.</p>
      </div>}
    </div>
  );
}
