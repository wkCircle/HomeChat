'use client';

import { useEffect, useRef, useState } from 'react';

interface ModelSelectorProps {
  models: string[];
  selectedModel: string;
  onSelect: (model: string) => void;
}

function ModelIcon({ model }: { model: string }) {
  const isOpenAI = model.toLowerCase().startsWith('gpt');
  return (
    <i
      aria-hidden="true"
      className={isOpenAI ? 'fa-brands fa-openai' : 'fa-solid fa-microchip'}
    />
  );
}

export function ModelSelector({ models, selectedModel, onSelect }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event instanceof MouseEvent && !containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      {open && (
        <div
          role="listbox"
          aria-label="Available models"
          className="absolute bottom-12 right-0 z-40 min-w-48 overflow-hidden rounded-lg border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-600 dark:bg-gray-700"
        >
          {models.map((model) => {
            const selected = model === selectedModel;
            return (
              <button
                key={model}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onSelect(model);
                  setOpen(false);
                }}
                className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  selected
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-gray-600 dark:text-indigo-300'
                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <ModelIcon model={model} />
                <span className="flex-1">{model}</span>
                {selected && <i aria-hidden="true" className="fa-solid fa-check text-xs" />}
              </button>
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
        <i aria-hidden="true" className="fa-solid fa-chevron-up text-[10px] text-gray-400" />
      </button>
    </div>
  );
}
