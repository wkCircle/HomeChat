"use client";
import { useEffect, useRef, useState } from "react";
import type { ConversationUsage } from "@/lib/types";
const usd = (value: number | null | undefined) => value == null ? 'Unavailable'
  : new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6}).format(value);
const tokens = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
export function ConversationUsageButton({
  usage,
  contextWindowTokens,
}: {
  usage: ConversationUsage | null;
  contextWindowTokens: number | undefined;
}) {
  const [open, setOpen] = useState(false);
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
            <div className="flex justify-between"><dt>Web searches</dt><dd>{usage?.web_search_calls ?? 0}</dd></div>
            <div className="flex justify-between"><dt>Search charges</dt><dd>{usd(usage?.estimated_tool_cost_usd)}</dd></div>
          </dl>
          {usage && !usage.pricing_complete && (
            <div className="mb-3 space-y-1 text-amber-700 dark:text-amber-300">
              <p>Incomplete estimate: missing rates, interrupted work, or unknown search-token attribution.</p>
              {usage.estimated_model_cost_usd == null && (
                <p>Model cost needs effective pricing rates and completed usage. Token counts below are independent of pricing.</p>
              )}
              {usage.estimated_tool_cost_usd == null && (
                <>
                  {usage.estimated_search_call_cost_usd != null && (
                    <p>Search call fees (excluding context): {usd(usage.estimated_search_call_cost_usd)}</p>
                  )}
                  <p>Search charges need call pricing, completed observations, and verified search-context billing. A search count alone is not a complete price.</p>
                </>
              )}
            </div>
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
