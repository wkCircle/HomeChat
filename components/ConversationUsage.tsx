"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { ConversationUsage } from "@/lib/types";
const usd = (value: number | null | undefined) => value == null ? 'Unavailable'
  : new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6}).format(value);
const tokens = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
function WebSearchCountInfo() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className="inline-flex self-stretch items-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="About web search counts and fees"
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current font-serif text-[10px] italic leading-none">i</span>
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute bottom-full left-0 z-40 w-60 pb-1">
          <span className="block rounded-lg border border-gray-200 bg-white p-2 text-xs font-normal leading-relaxed text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200">
            Only completed OpenAI search actions count here and incur search-call fees.
            {' '} open_page and find-in-page actions may appear as web_search
            in chat but doesn't add search-call fees. Model token charges are separate.
          </span>
        </span>
      )}
    </span>
  );
}

export function ConversationUsageButton({
  usage,
  contextWindowTokens,
}: {
  usage: ConversationUsage | null;
  contextWindowTokens: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const searchCost = usage?.estimated_tool_cost_usd ?? usage?.estimated_search_call_cost_usd;
  const searchLabel = usage?.estimated_tool_cost_usd != null ? 'Search charges' : 'Search call fees';
  const incompleteReasons: string[] = [];
  if (usage && !usage.pricing_complete) {
    if (usage.estimated_model_cost_usd == null) incompleteReasons.push('model rates or final usage missing');
    if (usage.estimated_tool_cost_usd == null) {
      incompleteReasons.push(usage.estimated_search_call_cost_usd == null
        ? 'search-call rates or final usage missing' : 'search-content billing unverified');
    }
  }
  const ref = useRef<HTMLDivElement>(null);
  const limit = contextWindowTokens ?? 1_050_000;
  const percent = Math.min(
    100,
    Math.round(((usage?.latest_input_tokens ?? 0) / limit) * 100),
  );
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Context usage ${percent}%`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative h-9 w-9 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-gray-200 dark:text-gray-600"
          />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray={`${percent} 100`}
            className="text-indigo-500"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold">
          {percent}%
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Conversation usage"
          className="absolute bottom-full right-0 z-30 mb-2 w-72 rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <div className="mb-3 flex justify-between text-sm font-medium">
            <span>Session cost</span>
            <span>
              {usd(usage?.estimated_cost_usd)}
            </span>
          </div>
          <dl className="mb-3 space-y-1">
            <div className="flex justify-between"><dt>Model token cost</dt><dd>{usd(usage?.estimated_model_cost_usd)}</dd></div>
            <div className="flex items-center justify-between">
              <dt className="relative flex items-center gap-1">Web searches <WebSearchCountInfo /></dt>
              <dd>{usage?.web_search_calls ?? 0}</dd>
            </div>
            <div className="flex justify-between"><dt>{searchLabel}</dt><dd>{usd(searchCost)}</dd></div>
          </dl>
          {usage && !usage.pricing_complete && (
            <p className="mb-3 text-amber-700 dark:text-amber-300">
              Incomplete estimate: {incompleteReasons.join('; ') || 'billing information missing'}.
              {' '}Token counts are still recorded.
            </p>
          )}
          <div className="mb-3">
            <div className="mb-1 flex justify-between">
              <span>Context window</span>
              <span>
                {tokens(usage?.latest_input_tokens ?? 0)} / {tokens(limit)} (
                {percent}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-1.5 rounded-full bg-indigo-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between">
              <dt>Input</dt>
              <dd>
                {tokens(
                  Math.max(
                    0,
                    (usage?.input_tokens ?? 0) -
                      (usage?.cached_input_tokens ?? 0) -
                      (usage?.cache_write_tokens ?? 0),
                  ),
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Cached input</dt>
              <dd>{tokens(usage?.cached_input_tokens ?? 0)}</dd>
            </div>
            {(usage?.cache_write_tokens ?? 0) > 0 && (
              <div className="flex justify-between">
                <dt>Cache writes</dt>
                <dd>{tokens(usage?.cache_write_tokens ?? 0)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Output</dt>
              <dd>{tokens(usage?.output_tokens ?? 0)}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
