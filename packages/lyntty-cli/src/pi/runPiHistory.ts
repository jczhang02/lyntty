import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { createEnvelope, type SessionEnvelope } from 'lyntty-wire';

const MAX_HISTORY_TEXT_LENGTH = 20_000;

function entryTime(entry: { timestamp?: string }): number {
  const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function compactText(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= MAX_HISTORY_TEXT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_HISTORY_TEXT_LENGTH)}\n\n[truncated by Lyntty history import]`;
}

function stringifyContent(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collectText(content: unknown): string {
  if (typeof content === 'string') {
    return compactText(content);
  }
  if (!Array.isArray(content)) {
    return compactText(stringifyContent(content));
  }

  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      const text = stringifyContent(item);
      if (text) parts.push(text);
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      parts.push(record.text);
      continue;
    }
    if (record.type === 'thinking' && typeof record.thinking === 'string') {
      parts.push(record.thinking);
      continue;
    }
    if (record.type === 'tool_result') {
      parts.push(stringifyContent(record.content));
      continue;
    }
  }

  return compactText(parts.filter(Boolean).join('\n'));
}

function messageRole(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  return (message as Record<string, unknown>).role as string | undefined;
}

function messageContent(message: unknown): unknown {
  if (!message || typeof message !== 'object') return undefined;
  return (message as Record<string, unknown>).content;
}

function toolName(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  return (message as Record<string, unknown>).toolName as string | undefined;
}

export function mapPiSessionEntryToHistoryEnvelopes(entry: SessionEntry): SessionEnvelope[] {
  if (entry.type !== 'message') {
    return [];
  }

  const role = messageRole(entry.message);
  const text = collectText(messageContent(entry.message));
  if (!text) {
    return [];
  }

  const time = entryTime(entry);
  if (role === 'user') {
    return [createEnvelope('user', { t: 'text', text }, {
      id: `pi-history-${entry.id}-user`,
      time,
    })];
  }

  if (role === 'assistant') {
    const turn = `pi-history-turn-${entry.id}`;
    return [
      createEnvelope('agent', { t: 'turn-start' }, { id: `pi-history-${entry.id}-start`, turn, time }),
      createEnvelope('agent', { t: 'text', text }, { id: `pi-history-${entry.id}-text`, turn, time: time + 1 }),
      createEnvelope('agent', { t: 'turn-end', status: 'completed' }, { id: `pi-history-${entry.id}-end`, turn, time: time + 2 }),
    ];
  }

  if (role === 'toolResult') {
    const turn = `pi-history-turn-${entry.id}`;
    const name = toolName(entry.message) ?? 'tool';
    return [
      createEnvelope('agent', { t: 'turn-start' }, { id: `pi-history-${entry.id}-start`, turn, time }),
      createEnvelope('agent', { t: 'text', text: `${name} result:\n${text}`, thinking: true }, { id: `pi-history-${entry.id}-tool-result`, turn, time: time + 1 }),
      createEnvelope('agent', { t: 'turn-end', status: 'completed' }, { id: `pi-history-${entry.id}-end`, turn, time: time + 2 }),
    ];
  }

  return [];
}

export function mapPiSessionHistoryToEnvelopes(entries: SessionEntry[]): SessionEnvelope[] {
  const envelopes: SessionEnvelope[] = [];
  for (const entry of entries) {
    envelopes.push(...mapPiSessionEntryToHistoryEnvelopes(entry));
  }
  return envelopes;
}
