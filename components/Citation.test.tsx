import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CitationGroup } from './Citation';
import { routeEvent } from '@/lib/useChat';

const source = { id: 'web_source', url: 'https://example.com/source', hostname: 'example.com', title: 'Evidence' };
afterEach(() => vi.useRealTimers());

describe('native citations', () => {
  it('updates a stable text part in place without duplicating text or moving UI parts', () => {
    const first = routeEvent([], { type: 'text', content: { part_id: 'part', text: 'Claim' }, metadata: {} });
    const withUI = routeEvent(first, { type: 'ui', content: { artifact: { type: 'test' } }, metadata: {} });
    const content = { part_id: 'part', text: 'Claim', sources: [source], citations: [{ source_id: source.id, start_index: 0, end_index: 5 }] };
    const updated = routeEvent(withUI, { type: 'text', content, metadata: {} });
    expect(routeEvent(updated, { type: 'text', content, metadata: {} })).toEqual(updated);
    expect(updated).toHaveLength(2);
    expect(updated[0]).toMatchObject(content);
  });
  it('opens interactive source links on focus and closes on Escape', () => {
    render(<CitationGroup sources={[source]} />);
    fireEvent.focus(screen.getByRole('button', { name: 'Sources: example.com' }));
    expect(screen.getByRole('dialog', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Evidence/ })).toHaveAttribute('href', source.url);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('opens at 500ms long press and keeps the preview open after release', () => {
    vi.useFakeTimers();
    render(<CitationGroup sources={[source]} />);
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(499));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    fireEvent.pointerUp(button, { pointerType: 'touch' });
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});


it('rejects malformed ranges and unsafe source URLs explicitly', () => {
  expect(() => routeEvent([], {
    type: 'text', metadata: {}, content: {
      text: 'Claim', sources: [source],
      citations: [{ source_id: source.id, start_index: 0, end_index: 99 }]
    }
  })).toThrow('Invalid citation range');
  expect(() => routeEvent([], { type: 'text', metadata: {}, content: { text: 'Claim', sources: [{ ...source, url: 'javascript:alert(1)' }] } })).toThrow('Unsafe');
});
