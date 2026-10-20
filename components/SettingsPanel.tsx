'use client';

import { useEffect, useRef, useState } from 'react';
import type { UserSettingsController } from '@/lib/useUserSettings';
import type { UserSettings } from '@/lib/types';

type Size = UserSettings['font_size'];
const SIZES: Size[] = ['small', 'medium', 'large'];
const SIZE_PX: Record<Size, string> = { small: '13px', medium: '15px', large: '17px' };

export function SettingsPanel({ preferences }: { preferences: UserSettingsController }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<'general' | 'tools'>('general');
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const theme = preferences.settings?.theme ?? 'system';
  const size = preferences.settings?.font_size ?? 'medium';
  const disabled = preferences.isLoadingSettings || preferences.isSavingSettings || !preferences.settings;

  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => root.classList.toggle('dark', dark);
    if (theme !== 'system') { apply(theme === 'dark'); return; }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    apply(media.matches);
    const change = (event: MediaQueryListEvent) => { apply(event.matches); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [theme]);
  useEffect(() => { document.documentElement.style.fontSize = SIZE_PX[size]; }, [size]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const buttons = panel.current?.querySelectorAll<HTMLElement>(':is(button, select, [tabindex="0"]):not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = previousOverflow;
      trigger.current?.focus();
    };
  }, [open]);

  const sizeIdx = SIZES.indexOf(size);
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} title="Settings" aria-label="Settings"
      aria-haspopup="dialog" aria-expanded={open}
      className="rounded p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-gray-400 dark:hover:bg-gray-700"><GearIcon /></button>
    {open && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-3 sm:items-center"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl focus:outline-none dark:border-gray-700 dark:bg-gray-800">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 id="settings-title" className="font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button type="button" aria-label="Close settings" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-indigo-400 dark:text-gray-300 dark:hover:bg-gray-700">Close</button>
        </header>
        <div className="flex min-h-72">
          <nav aria-label="Settings sections" className="w-28 shrink-0 border-r border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/30">
            {(['general', 'tools'] as const).map((item) => <button key={item} type="button"
              aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm capitalize focus-visible:ring-2 focus-visible:ring-indigo-400 ${section === item ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{item}</button>)}
          </nav>
          <section aria-label={section === 'general' ? 'General settings' : 'Tool defaults'} className="max-h-[70dvh] min-w-0 flex-1 overflow-y-auto p-4">
            {preferences.isLoadingSettings && <p role="status" className="mb-3 text-sm text-gray-500">Loading settings...</p>}
            {preferences.error && <div className="mb-3 text-sm text-red-600 dark:text-red-300"><p role="alert">{preferences.error}</p><button type="button" disabled={preferences.isLoadingSettings || preferences.isSavingSettings} onClick={() => void preferences.reloadSettings()} className="mt-1 underline">Retry loading settings</button></div>}
            {section === 'general' ? <>
              <label htmlFor="settings-theme" className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-200">Theme</label>
              <select id="settings-theme" value={theme} disabled={disabled} onChange={(event) => {
                const value = event.target.value;
                if (value === 'system' || value === 'light' || value === 'dark') void preferences.saveSettings({ theme: value });
              }} className="mb-5 w-full rounded border border-gray-300 bg-white px-2 py-2 text-sm text-gray-800 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="system">System default</option><option value="light">Light</option><option value="dark">Dark</option>
              </select>
              <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Font size</h3>
              <div className="flex items-center gap-2">
                <button type="button" disabled={disabled || sizeIdx === 0} aria-label="Decrease font size" onClick={() => void preferences.saveSettings({ font_size: SIZES[Math.max(0, sizeIdx - 1)] })} className="h-8 w-8 rounded border border-gray-300 text-gray-600 disabled:opacity-30 dark:border-gray-600 dark:text-gray-200">-</button>
                <div className="flex flex-1 gap-1.5">{SIZES.map((value, index) => <button key={value} type="button" aria-label={value} aria-pressed={sizeIdx === index} disabled={disabled} onClick={() => void preferences.saveSettings({ font_size: value })} className={`h-3 flex-1 rounded-full focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 ${index === sizeIdx ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-600'}`} />)}</div>
                <button type="button" disabled={disabled || sizeIdx === SIZES.length - 1} aria-label="Increase font size" onClick={() => void preferences.saveSettings({ font_size: SIZES[Math.min(SIZES.length - 1, sizeIdx + 1)] })} className="h-8 w-8 rounded border border-gray-300 text-gray-600 disabled:opacity-30 dark:border-gray-600 dark:text-gray-200">+</button>
              </div><p className="mt-2 text-center text-xs capitalize text-gray-500 dark:text-gray-400">{size}</p>
            </> : <>
              <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">Default tools</h3>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">Defaults apply to new chats and chats without an explicit choice. Existing chat choices stay unchanged.</p>
              {preferences.tools.map((tool) => <div key={tool.id} className="mb-4 flex items-start justify-between gap-3">
                <div><span className="text-sm font-medium text-gray-900 dark:text-gray-100">{tool.label}</span><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{tool.description}</p></div>
                <button type="button" role="switch" aria-label={`Default ${tool.label}`} aria-checked={preferences.settings?.tool_defaults[tool.id] === true} disabled={disabled}
                  onClick={() => void preferences.saveSettings({ tool_defaults: { [tool.id]: !preferences.settings?.tool_defaults[tool.id] } })}
                  className={`relative h-6 w-11 shrink-0 rounded-full focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 ${preferences.settings?.tool_defaults[tool.id] ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}><span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${preferences.settings?.tool_defaults[tool.id] ? 'translate-x-5' : ''}`} /></button>
              </div>)}
            </>}
            {preferences.isSavingSettings && <p role="status" className="mt-3 text-xs text-gray-500">Saving settings...</p>}
          </section>
        </div>
      </div>
    </div>}
  </>;
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
