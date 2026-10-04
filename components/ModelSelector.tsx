"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ModelPricing } from "@/lib/types";

interface ModelSelectorProps {
  models: string[];
  selectedModel: string;
  contextWindows: Record<string, number>;
  pricing: Record<string, ModelPricing | null>;
  onSelect: (model: string) => void;
}

function ModelIcon({ model }: { model: string }) {
  return (
    <i
      aria-hidden="true"
      className={
        model.toLowerCase().startsWith("gpt")
          ? "fa-brands fa-openai"
          : "fa-solid fa-microchip"
      }
    />
  );
}

function formatPrice(price: number) {
  return `$${price.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
}

function ModelDetails({
  model,
  contextWindow,
  pricing,
}: {
  model: string;
  contextWindow: number | undefined;
  pricing: ModelPricing | null;
}) {
  if (!pricing) {
    return (
      <div
        role="tooltip"
        className="fixed inset-x-3 bottom-24 z-50 max-h-[calc(100dvh-7rem)] w-auto overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-xl md:absolute md:inset-x-auto md:bottom-0 md:right-[calc(100%+0.5rem)] md:max-h-none md:w-72 md:overflow-visible dark:border-gray-600 dark:bg-gray-800"
      >
        <p className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          {model}
        </p>
        <p className="mb-3 text-gray-600 dark:text-gray-300">
          Context window: {contextWindow?.toLocaleString() ?? "Unavailable"}{" "}
          tokens
        </p>
        <p className="text-gray-500 dark:text-gray-400">
          Current pricing is unavailable in local in-memory mode.
        </p>
      </div>
    );
  }
  const pricingRows = [
    ["Input", pricing.input_price, pricing.long_input_price],
    [
      "Cached input",
      pricing.cached_input_price,
      pricing.long_cached_input_price,
    ],
    ["Cache write", pricing.cache_write_price, pricing.long_cache_write_price],
    ["Output", pricing.output_price, pricing.long_output_price],
  ] as const;
  return (
    <div
      role="tooltip"
      className="fixed inset-x-3 bottom-24 z-50 max-h-[calc(100dvh-7rem)] w-auto overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-xl md:absolute md:inset-x-auto md:bottom-0 md:right-[calc(100%+0.5rem)] md:max-h-none md:w-[26rem] md:overflow-visible dark:border-gray-600 dark:bg-gray-800"
    >
      <p className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
        {model}
      </p>
      <p className="text-gray-600 dark:text-gray-300">
        Context window: {contextWindow?.toLocaleString() ?? "Unavailable"}{" "}
        tokens
      </p>
      <p className="mb-3 text-gray-500 dark:text-gray-400">
        Prices in {pricing.currency} per{" "}
        {pricing.pricing_unit_tokens.toLocaleString()} tokens.
      </p>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-right">
        <span className="text-left font-medium text-gray-800 dark:text-gray-100">
          Token type
        </span>
        <span className="font-medium text-gray-800 dark:text-gray-100">
          Default
        </span>
        <span className="font-medium text-gray-800 dark:text-gray-100">
          Long context
        </span>
        {pricingRows
          .filter(([, standard, long]) => standard !== null || long !== null)
          .map(([label, standard, long]) => (
            <Fragment key={label}>
              <span className="text-left">{label}</span>
              <span>{standard === null ? "-" : formatPrice(standard)}</span>
              <span>{long === null ? "-" : formatPrice(long)}</span>
            </Fragment>
          ))}
      </div>
      <p className="mt-3 text-gray-500 dark:text-gray-400">
        Long-context rates apply above{" "}
        {pricing.long_context_threshold.toLocaleString()} input tokens.
      </p>
    </div>
  );
}

export function ModelSelector({
  models,
  selectedModel,
  contextWindows,
  pricing,
  onSelect,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [hoveredModel, setHoveredModel] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape")
        setOpen(false);
      if (
        event instanceof MouseEvent &&
        !containerRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={containerRef} className="relative shrink-0">
      {open && (
        <div
          role="listbox"
          aria-label="Available models"
          className="absolute bottom-12 right-0 z-40 min-w-48 overflow-visible rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-600 dark:bg-gray-700"
        >
          {models.map((model) => {
            const selected = model === selectedModel;
            return (
              <div
                key={model}
                className="relative"
                onMouseEnter={() => setHoveredModel(model)}
                onMouseLeave={() => setHoveredModel(null)}
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onFocus={() => setHoveredModel(model)}
                  onBlur={() => setHoveredModel(null)}
                  onClick={() => {
                    onSelect(model);
                    setOpen(false);
                  }}
                  className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                    selected
                      ? "bg-indigo-50 text-indigo-700 dark:bg-gray-600 dark:text-indigo-300"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  <ModelIcon model={model} />
                  <span className="flex-1">{model}</span>
                  {selected && (
                    <i
                      aria-hidden="true"
                      className="fa-solid fa-check text-xs"
                    />
                  )}
                </button>
                {hoveredModel === model && (
                  <ModelDetails
                    model={model}
                    contextWindow={contextWindows[model]}
                    pricing={pricing[model] ?? null}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Select model, currently ${selectedModel}`}
        title="Select model"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 max-w-36 items-center gap-2 rounded-lg px-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-gray-200 dark:hover:bg-gray-600"
      >
        <ModelIcon model={selectedModel} />
        <span className="truncate">{selectedModel}</span>
        <i
          aria-hidden="true"
          className="fa-solid fa-chevron-up text-[10px] text-gray-400"
        />
      </button>
    </div>
  );
}
