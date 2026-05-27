'use client';

import { useState, useEffect, useRef } from 'react';

type Theme = 'system' | 'light' | 'dark';
type Size = 'small' | 'medium' | 'large';

const SIZES: Size[] = ['small', 'medium', 'large'];
const SIZE_PX: Record<Size, string> = { small: '13px', medium: '15px', large: '17px' };

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('system');
  const [size, setSize] = useState<Size>('medium');
  const panelRef = useRef<HTMLDivElement>(null);

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) =>
      dark ? root.classList.add('dark') : root.classList.remove('dark');

    if (theme === 'dark') { apply(true); return; }
    if (theme === 'light') { apply(false); return; }
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches);
    const listener = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  // Apply font size to <html>
  useEffect(() => {
    document.documentElement.style.fontSize = SIZE_PX[size];
  }, [size]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const sizeIdx = SIZES.indexOf(size);

  return (
    <div className="relative" ref={panelRef}>
      {/* Gear icon button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Settings"
        aria-label="Settings"
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <GearIcon />
      </button>

      {/* Floating panel */}
      {open && (
        <div className="absolute right-0 top-10 z-50 w-60 rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-800">

          {/* Theme */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Theme
            </label>
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="system">System default</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          {/* Font size */}
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Font size
            </label>
            <div className="flex items-center gap-2">
              {/* − button */}
              <button
                onClick={() => setSize(SIZES[Math.max(0, sizeIdx - 1)])}
                disabled={sizeIdx === 0}
                aria-label="Decrease font size"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 text-base font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                −
              </button>

              {/* Discrete track */}
              <div className="flex flex-1 items-center gap-1.5">
                {SIZES.map((s, i) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    aria-label={s}
                    className={`h-2 flex-1 rounded-full transition-colors ${
                      i === sizeIdx
                        ? 'bg-indigo-500'
                        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500'
                    }`}
                  />
                ))}
              </div>

              {/* + button */}
              <button
                onClick={() => setSize(SIZES[Math.min(SIZES.length - 1, sizeIdx + 1)])}
                disabled={sizeIdx === SIZES.length - 1}
                aria-label="Increase font size"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-gray-300 text-base font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                +
              </button>
            </div>

            {/* Current size label */}
            <p className="mt-1.5 text-center text-[11px] capitalize text-gray-400 dark:text-gray-500">
              {size}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
