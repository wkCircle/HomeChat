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
