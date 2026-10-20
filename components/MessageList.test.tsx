import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/lib/types';
import { MessageList } from './MessageList';

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const pendingAssistantMessage: ChatMessage = {
  id: 'assistant-pending',
  role: 'assistant',
  status: 'streaming',
  parts: [],
};

describe('MessageList', () => {
  it('replaces the working label while compaction is active', () => {
    render(<MessageList messages={[pendingAssistantMessage]} isLoading isCompacting />);

    expect(screen.getByText('Compacting the conversation history…')).toBeInTheDocument();
    expect(screen.queryByText('Working…')).not.toBeInTheDocument();
  });

  it('shows the working label when compaction is inactive', () => {
    render(<MessageList messages={[pendingAssistantMessage]} isLoading />);

    expect(screen.getByText('Working…')).toBeInTheDocument();
    expect(screen.queryByText('Compacting the conversation history…')).not.toBeInTheDocument();
  });

  it.each([
    'A supported claim. [Source](https://example.com/source)',
    '<p>A supported claim. <a href="https://example.com/source">Source</a></p>',
  ])('renders clickable sources in Markdown and sanitized HTML: %s', (text) => {
    const messages: ChatMessage[] = [{
      id: 'answer', role: 'assistant', parts: [{ type: 'text', text }],
    }];
    render(<MessageList messages={messages} />);
    expect(screen.getByRole('link', { name: 'Source' })).toHaveAttribute(
      'href', 'https://example.com/source',
    );
  });

  it('removes executable HTML, custom CSS, and unsafe link schemes', () => {
    const messages: ChatMessage[] = [{
      id: 'answer', role: 'assistant', parts: [{
        type: 'text',
        text: '<div style="color:red" onclick="window.untrusted = true">Readable</div>' +
          '<script>window.untrusted = true</script><iframe src="https://example.com"></iframe>' +
          '<a href="javascript:alert(1)">Unsafe link</a>',
      }],
    }];
    const { container } = render(<MessageList messages={messages} />);
    expect(screen.getByText('Readable')).not.toHaveAttribute('style');
    expect(screen.getByText('Readable')).not.toHaveAttribute('onclick');
    expect(container.querySelector('script, iframe')).toBeNull();
    expect(screen.getByText('Unsafe link')).not.toHaveAttribute('href', 'javascript:alert(1)');
  });

  it('displays fenced HTML as code instead of rendering it', () => {
    const messages: ChatMessage[] = [{
      id: 'answer', role: 'assistant', parts: [{
        type: 'text', text: '```html\n<strong>Example</strong>\n```',
      }],
    }];
    const { container } = render(<MessageList messages={messages} />);
    expect(container.querySelector('pre code')).toHaveTextContent('<strong>Example</strong>');
    expect(container.querySelector('strong')).toBeNull();
  });
});


describe('verified citation markup', () => {
  const sources = [
    {id: 'a', url: 'https://example.com/a', hostname: 'example.com', title: 'First'},
    {id: 'b', url: 'https://example.org/b', hostname: 'example.org', title: 'Second'},
  ];
  it.each([
    'Claim [A](https://example.com/a) [B](https://example.org/b)',
    '<p>Claim <a href="https://example.com/a">A</a> <a href="https://example.org/b">B</a></p>',
  ])('groups adjacent verified links after sanitization: %s', text => {
    render(<MessageList messages={[{id: 'cited', role: 'assistant', parts: [{type: 'text', text, sources,
      citations: sources.map(source => ({source_id: source.id, start_index: 0, end_index: Array.from(text).length}))}]}]}/>);
    expect(screen.getAllByRole('button', {name: 'Sources: example.com'})).toHaveLength(1);
    expect(screen.getByText('1+')).toBeInTheDocument();
    expect(screen.queryByRole('link', {name: 'A'})).not.toBeInTheDocument();
  });
  it('handles Unicode code-point ranges and preserves claim text', () => {
    const text = '\u{1f600} Claim. Next';
    render(<MessageList messages={[{id: 'unicode', role: 'assistant', parts: [{type: 'text', text, sources: [sources[0]],
      citations: [{source_id: 'a', start_index: 2, end_index: 8}]}]}]}/>);
    expect(screen.getByRole('button', {name: 'Sources: example.com'})).toBeInTheDocument();
    expect(screen.getByText(/Next/)).toBeInTheDocument();
  });
  it('never transforms code or unrelated links into citation controls', () => {
    const text = '`Claim` [Unrelated](https://unrelated.example)';
    render(<MessageList messages={[{id: 'code', role: 'assistant', parts: [{type: 'text', text, sources: [sources[0]],
      citations: [{source_id: 'a', start_index: 1, end_index: 6}]}]}]}/>);
    expect(screen.queryByRole('button', {name: /Sources:/})).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Unrelated'})).toBeInTheDocument();
  });
});


it.each(['success', 'error'] as const)('renders web-search action and %s using existing tool boxes', status => {
  const messages: ChatMessage[] = [{id: 'search', role: 'assistant', parts: [
    {type: 'function_call_start', calls: {'0': {
      id: 'web_search:response:call', name: 'web_search', args: {type: 'search', query: 'Hamburg weather'},
    }}},
    {type: 'function_call_end', tool_call_id: 'web_search:response:call', name: 'web_search', status,
      content: {sources: [{url: 'https://example.com/'}], note: 'Provider metadata, not raw page bodies.'}},
  ]}];
  render(<MessageList messages={messages} isLoading />);
  expect(screen.getByText('Called web_search (search)')).toBeInTheDocument();
  expect(screen.getByText(/Hamburg weather/)).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`web_search.*${status}`))).toHaveClass(status === 'success' ? 'text-green-700' : 'text-red-700');
  expect(screen.getByText(/Provider metadata, not raw page bodies/)).toBeInTheDocument();
});

it('renders a pending search only when an actual start event exists', () => {
  render(<MessageList messages={[{id: 'search', role: 'assistant', parts: [{
    type: 'function_call_start', calls: {'0': {id: 'call', name: 'web_search', args: {}}},
  }]}]} isLoading />);
  expect(screen.getByText(/Calling web_search/)).toBeInTheDocument();
  expect(screen.queryByText('Called web_search')).not.toBeInTheDocument();
});


it.each([
  ['search', 'search'], ['open_page', 'open page'], ['find_in_page', 'find in page'],
])('distinguishes hosted %s actions in pending and completed cards', (action, label) => {
  const messages: ChatMessage[] = [{ id: 'hosted', role: 'assistant', parts: [
    { type: 'function_call_start', calls: { '0': { id: 'call', name: 'web_search', args: { type: action } } } },
    { type: 'function_call_end', tool_call_id: 'call', name: 'web_search', status: 'success', content: { action: { type: action } } },
  ] }];
  const { rerender } = render(<MessageList messages={[{ ...messages[0], parts: [messages[0].parts[0]] }]} isLoading />);
  expect(screen.getByText(`Calling web_search (${label})\u2026`)).toBeInTheDocument();
  rerender(<MessageList messages={messages} />);
  expect(screen.getByText(`Called web_search (${label})`)).toBeInTheDocument();
  expect(screen.getByText(`\u2713 web_search (${label}) \u2014 success`)).toBeInTheDocument();
});

it('keeps custom-tool names and legacy hosted results unchanged', () => {
  render(<MessageList messages={[{ id: 'legacy', role: 'assistant', parts: [
    { type: 'function_call_start', calls: { '0': { id: 'custom', name: 'create_graph', args: { type: 'search' } } } },
    { type: 'function_call_end', tool_call_id: 'custom', name: 'create_graph', status: 'success', content: { action: { type: 'open_page' } } },
    { type: 'function_call_end', tool_call_id: 'hosted', name: 'web_search', status: 'error', content: 'Legacy unavailable result' },
  ] }]} />);
  expect(screen.getByText('Called create_graph')).toBeInTheDocument();
  expect(screen.getByText('\u2713 create_graph \u2014 success')).toBeInTheDocument();
  expect(screen.getByText('\u2717 web_search \u2014 error')).toBeInTheDocument();
});
