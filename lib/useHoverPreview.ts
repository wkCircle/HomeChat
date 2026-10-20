"use client";

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

/** Shared mouse/focus and 500ms touch-preview mechanics. */
export function useHoverPreview<T>() {
  const [active, setActive] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggered = useRef(false);
  const touch = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const clearTimer = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; };
  const clearClose = () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current); closeTimer.current = null; };
  useEffect(() => {
    const keyboard = () => { touch.current = false; };
    window.addEventListener('keydown', keyboard);
    window.addEventListener('scroll', clearTimer, true);
    return () => { clearTimer(); clearClose(); window.removeEventListener('scroll', clearTimer, true); window.removeEventListener('keydown', keyboard); };
  }, []);
  return {
    active, setActive, clearTimer,
    enter(value: T, event: PointerEvent<HTMLElement>) { clearClose(); if (event.pointerType === 'mouse') setActive(value); },
    leave(event: PointerEvent<HTMLElement>) {
      clearTimer();
      if (event.pointerType === 'mouse') { clearClose(); closeTimer.current = setTimeout(() => setActive(null), 120); }
    },
    focus(value: T) { clearClose(); if (!touch.current) setActive(value); },
    down(value: T, event: PointerEvent<HTMLElement>) {
      touch.current = event.pointerType === 'touch';
      triggered.current = false;
      if (!touch.current) return;
      clearTimer(); setActive(null);
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => { triggered.current = true; setActive(value); }, 500);
    },
    move(event: PointerEvent<HTMLElement>) {
      if (event.pointerType === 'touch' && Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y) > 8) clearTimer();
    },
    contextMenu(event: { preventDefault(): void }) { if (touch.current) event.preventDefault(); },
    consumeLongPress() { const result = triggered.current; triggered.current = false; return result; },
  };
}
