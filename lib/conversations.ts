import type { ConversationSummary } from './types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export function formatConversationAge(timestamp: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(timestamp));
  if (elapsed < MINUTE_MS) return '<1m';
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  if (elapsed < WEEK_MS) return `${Math.floor(elapsed / DAY_MS)}d`;
  if (elapsed < MONTH_MS) return `${Math.floor(elapsed / WEEK_MS)}w`;
  if (elapsed < YEAR_MS) return `${Math.floor(elapsed / MONTH_MS)}mon`;
  return `${Math.floor(elapsed / YEAR_MS)}y`;
}

export function mergeConversations(
  current: ConversationSummary[],
  incoming: ConversationSummary[],
): ConversationSummary[] {
  const byId = new Map(current.map((conversation) => [conversation.id, conversation]));
  for (const conversation of incoming) byId.set(conversation.id, conversation);
  return [...byId.values()].sort((left, right) => {
    const timestampDifference = Date.parse(right.last_message_at) - Date.parse(left.last_message_at);
    return timestampDifference || right.id.localeCompare(left.id);
  });
}
