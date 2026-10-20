import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ConversationUsage } from '@/lib/types';
import { ConversationUsageButton } from './ConversationUsage';

const usage: ConversationUsage = {
  conversation_id: 'conversation', invocations: 1,
  input_tokens: 10, cached_input_tokens: 0, cache_write_tokens: 0, output_tokens: 5, total_tokens: 15,
  latest_input_tokens: 10, latest_model: 'gpt-6-luna', estimated_model_cost_usd: 0.12,
  estimated_tool_cost_usd: 0.03, estimated_search_call_cost_usd: 0.03, estimated_cost_usd: 0.15, web_search_calls: 3, pricing_complete: true
};

it('shows a complete one-search estimate when search tokens are covered by model usage', () => {
  render(<ConversationUsageButton usage={{
    ...usage, web_search_calls: 1, search_call_pricing_complete: true,
    estimated_tool_cost_usd: 0.01, estimated_search_call_cost_usd: 0.01,
    estimated_model_cost_usd: 0.12, estimated_cost_usd: 0.13, pricing_complete: true,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Search charges').parentElement).toHaveTextContent('$0.01');
  expect(screen.getByText('$0.12')).toBeInTheDocument();
  expect(screen.getByText('$0.13')).toBeInTheDocument();
  expect(screen.queryByText(/Incomplete estimate/)).not.toBeInTheDocument();
  expect(screen.queryByText(/search-content billing unverified/)).not.toBeInTheDocument();
});

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
      estimated_tool_cost_usd: null, estimated_search_call_cost_usd: null, pricing_complete: false
    }} contextWindowTokens={1000} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
    expect(screen.getByText(/Incomplete estimate/)).toBeInTheDocument();
    expect(screen.getByText('$0.12')).toBeInTheDocument();
  });
});


it('keeps token counts visible when pricing is unavailable and explains the difference', () => {
  render(<ConversationUsageButton usage={{
    ...usage, estimated_model_cost_usd: null, estimated_tool_cost_usd: null, estimated_search_call_cost_usd: null,
    estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Model token cost')).toBeInTheDocument();
  expect(screen.getByText(/Token counts are still recorded/)).toBeInTheDocument();
  expect(screen.getByText('Input')).toBeInTheDocument();
  expect(screen.getByText('Output')).toBeInTheDocument();
  expect(screen.getAllByText('Unavailable')).toHaveLength(3);
});

it('shows known search-call fees without presenting them as the complete search charge', () => {
  render(<ConversationUsageButton usage={{
    ...usage, estimated_tool_cost_usd: null, estimated_search_call_cost_usd: 0.03,
    estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Search call fees').parentElement).toHaveTextContent('$0.03');
  expect(screen.getAllByText('Unavailable')).toHaveLength(1);
  expect(screen.getByText(/search-content billing unverified/)).toBeInTheDocument();
});


it('uses one concise incomplete notice rather than several yellow explanations', () => {
  const {container} = render(<ConversationUsageButton usage={{
    ...usage, estimated_model_cost_usd: null, estimated_tool_cost_usd: null,
    estimated_search_call_cost_usd: null, estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(container.querySelectorAll('p.text-amber-700')).toHaveLength(1);
  expect(screen.getByText(/model rates or final usage missing/)).toBeInTheDocument();
  expect(screen.getByText(/search-call rates or final usage missing/)).toBeInTheDocument();
});

it('shows zero charges only when the backend explicitly reports no charge', () => {
  render(<ConversationUsageButton usage={{
    ...usage, web_search_calls: 0, estimated_search_call_cost_usd: 0,
    estimated_tool_cost_usd: 0, estimated_cost_usd: 0.12,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Search charges').parentElement).toHaveTextContent('$0.00');
  expect(screen.queryByText(/Incomplete estimate/)).not.toBeInTheDocument();
});


it('uses cumulative backend totals when a second prompt finishes', () => {
  const { rerender } = render(<ConversationUsageButton usage={{
    ...usage, estimated_tool_cost_usd: null, estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Web searches').parentElement).toHaveTextContent('3');
  expect(screen.getByText('Search call fees').parentElement).toHaveTextContent('$0.03');
  rerender(<ConversationUsageButton usage={{
    ...usage, invocations: 2, web_search_calls: 7, estimated_search_call_cost_usd: 0.07,
    estimated_tool_cost_usd: null, estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  expect(screen.getByText('Web searches').parentElement).toHaveTextContent('7');
  expect(screen.getByText('Search call fees').parentElement).toHaveTextContent('$0.07');
  expect(screen.getByRole('button', { name: 'About web search counts and fees' })).toBeInTheDocument();
});


it('explains search fees from the adjacent info icon on hover', () => {
  render(<ConversationUsageButton usage={usage} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button', { name: /Context usage/ }));
  const info = screen.getByRole('button', { name: 'About web search counts and fees' });
  expect(info.closest('dt')).toBe(screen.getByText('Web searches'));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.mouseEnter(info);
  const tooltip = screen.getByRole('tooltip');
  expect(info).toHaveAttribute('aria-describedby', tooltip.id);
  expect(tooltip).toHaveTextContent('Only completed OpenAI search actions');
  expect(tooltip).toHaveTextContent('incur search-call fees');
  expect(tooltip).toHaveTextContent('open_page');
  expect(tooltip).toHaveTextContent('find-in-page');
  expect(tooltip).toHaveTextContent('Model token charges are separate');
  fireEvent.mouseLeave(info, { relatedTarget: tooltip });
  fireEvent.mouseEnter(tooltip);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.mouseLeave(tooltip, { relatedTarget: document.body });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});

it('supports keyboard focus and dismisses info before the usage panel with Escape', () => {
  render(<ConversationUsageButton usage={usage} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button', { name: /Context usage/ }));
  const info = screen.getByRole('button', { name: 'About web search counts and fees' });
  fireEvent.focus(info);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.keyDown(info, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Conversation usage' })).toBeInTheDocument();
  fireEvent.keyDown(info, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('supports a tap and clears the explanation on blur or panel close', () => {
  render(<ConversationUsageButton usage={usage} contextWindowTokens={1000} />);
  const toggle = screen.getByRole('button', { name: /Context usage/ });
  fireEvent.click(toggle);
  const info = screen.getByRole('button', { name: 'About web search counts and fees' });
  fireEvent.click(info);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.blur(info);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.click(info);
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(screen.queryByText('Search actions across all turns; page opens/finds excluded.')).not.toBeInTheDocument();
});


it('keeps known call fees visible after Stop without presenting them as the full charge', () => {
  render(<ConversationUsageButton usage={{
    ...usage, search_call_pricing_complete: false, estimated_search_call_cost_usd: 0.03,
    estimated_model_cost_usd: null, estimated_tool_cost_usd: null,
    estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button', { name: /Context usage/ }));
  expect(screen.getByText('Known search call fees').parentElement).toHaveTextContent('$0.03');
  expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  expect(screen.getByText(/search-call accounting incomplete; showing known fees only/)).toBeInTheDocument();
  expect(screen.queryByText('Search charges')).not.toBeInTheDocument();
});

it('never turns unknown interrupted-call fees into a free estimate', () => {
  render(<ConversationUsageButton usage={{
    ...usage, search_call_pricing_complete: false, estimated_search_call_cost_usd: null,
    estimated_model_cost_usd: null, estimated_tool_cost_usd: null,
    estimated_cost_usd: null, pricing_complete: false,
  }} contextWindowTokens={1000} />);
  fireEvent.click(screen.getByRole('button', { name: /Context usage/ }));
  expect(screen.getByText('Search call fees').parentElement).toHaveTextContent('Unavailable');
  expect(screen.getByText(/search-call rates or final usage missing/)).toBeInTheDocument();
  expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
});
