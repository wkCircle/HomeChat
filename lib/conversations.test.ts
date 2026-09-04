import { describe, expect, it } from 'vitest';
import type { ConversationSummary } from './types';
import { formatConversationAge, mergeConversations } from './conversations';

const now = Date.parse('2026-08-31T12:00:00Z');

function conversation(id: string, lastMessageAt: string): ConversationSummary {
  return {
    id,
    title: id,
    pinned: false,
    run_status: null,
    active_run_id: null,
    created_at: lastMessageAt,
    updated_at: lastMessageAt,
    last_message_at: lastMessageAt,
  };
}

describe('formatConversationAge', () => {
  it.each([
    ['2026-08-31T11:59:30Z', '<1m'],
    ['2026-08-31T11:59:00Z', '1m'],
    ['2026-08-31T00:00:00Z', '12h'],
    ['2026-08-30T12:00:00Z', '1d'],
    ['2026-08-24T12:00:00Z', '1w'],
    ['2026-07-02T12:00:00Z', '2mon'],
    ['2024-08-31T12:00:00Z', '2y'],
  ])('formats %s as %s', (timestamp, expected) => {
    expect(formatConversationAge(timestamp, now)).toBe(expected);
  });
});

describe('mergeConversations', () => {
  it('deduplicates overlapping pages and orders newest activity first', () => {
    const older = conversation('older', '2026-08-30T12:00:00Z');
    const newer = conversation('newer', '2026-08-31T11:00:00Z');
    const updatedOlder = { ...older, last_message_at: '2026-08-31T11:30:00Z' };

    const merged = mergeConversations([older, newer], [updatedOlder]);

    expect(merged.map((item) => item.id)).toEqual(['older', 'newer']);
    expect(merged).toHaveLength(2);
  });
});
