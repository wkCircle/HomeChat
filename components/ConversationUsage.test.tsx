import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversationUsage } from '@/lib/types';
import { ConversationUsageButton } from './ConversationUsage';

const usage: ConversationUsage = {
  conversation_id: 'conversation', invocations: 1,
  input_tokens: 10, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 5, total_tokens: 15,
  latest_input_tokens: 10, latest_model: 'gpt-6-luna', estimated_model_cost_usd: 0.12,
  estimated_tool_cost_usd: 0.03, estimated_cost_usd: 0.15, web_search_calls: 3, pricing_complete: true
};

describe('conversation search costs', () => {
  it('shows total and separate token/search estimates', () => {
    render(<ConversationUsageButton usage={usage} contextWindowTokens={1000} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('$0.15')).toBeInTheDocument();
    expect(screen.getByText('$0.12')).toBeInTheDocument();
    expect(screen.getByText('$0.03')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  it('labels unknown costs as incomplete, not zero', () => {
    render(<ConversationUsageButton usage={{
      ...usage, estimated_cost_usd: null,
      estimated_tool_cost_usd: null, pricing_complete: false
    }} contextWindowTokens={1000} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText(/Incomplete estimate/)).toBeInTheDocument();
    expect(screen.getByText('$0.12')).toBeInTheDocument();
  });
});
