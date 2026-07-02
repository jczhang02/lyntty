import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { createEnvelope, type SessionEnvelope } from 'lyntty-wire';

const MAX_HISTORY_TEXT_LENGTH = 20_000;
const MAX_HISTORY_TOOL_ARGS_LENGTH = 20_000;
const DEFAULT_HISTORY_PAGE_BYTES = 256_000;
const MAX_HISTORY_PAGE_BYTES = 512_000;
const HISTORY_TRUNCATED_TEXT = '[Large historical Pi message truncated to fit Lyntty history page limits]';
const HISTORY_TRUNCATION_MARKER = '\n\n[truncated by Lyntty history import]';

function entryTime(entry: { timestamp?: string }): number {
  const parsed = entry.timestamp ? Date.parse(entry.timestamp) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function compactText(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= MAX_HISTORY_TEXT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_HISTORY_TEXT_LENGTH)}${HISTORY_TRUNCATION_MARKER}`;
}

function truncateTextToBytes(text: string, maxBytes: number): string {
  const markerBytes = byteLength(HISTORY_TRUNCATION_MARKER);
  const targetBytes = Math.max(0, maxBytes - markerBytes);
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) {
    return text;
  }
  return `${buffer.subarray(0, targetBytes).toString('utf8')}${HISTORY_TRUNCATION_MARKER}`;
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

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function cappedJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  let json = '';
  try {
    json = JSON.stringify(value);
  } catch {
    return { truncated: true, value: '[unserializable tool arguments]' };
  }
  if (json.length <= MAX_HISTORY_TOOL_ARGS_LENGTH) {
    return value;
  }
  return {
    truncated: true,
    preview: json.slice(0, MAX_HISTORY_TOOL_ARGS_LENGTH),
  };
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

function collectTextItems(content: unknown): Array<{ type: 'text' | 'thinking'; text: string }> {
  if (typeof content === 'string') {
    const text = compactText(content);
    return text ? [{ type: 'text', text }] : [];
  }
  if (!Array.isArray(content)) {
    const text = compactText(stringifyContent(content));
    return text ? [{ type: 'text', text }] : [];
  }

  const parts: Array<{ type: 'text' | 'thinking'; text: string }> = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      const text = compactText(stringifyContent(item));
      if (text) parts.push({ type: 'text', text });
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      const text = compactText(record.text);
      if (text) parts.push({ type: 'text', text });
      continue;
    }
    if (record.type === 'thinking' && typeof record.thinking === 'string') {
      const text = compactText(record.thinking);
      if (text) parts.push({ type: 'thinking', text });
    }
  }
  return parts;
}

type AssistantHistoryPart =
  | { kind: 'text' | 'thinking'; text: string }
  | { kind: 'toolCall'; id: string; name: string; args: Record<string, unknown> };

function collectAssistantParts(content: unknown): AssistantHistoryPart[] {
  if (!Array.isArray(content)) {
    return collectTextItems(content).map((part) => ({ kind: part.type, text: part.text }));
  }

  const parts: AssistantHistoryPart[] = [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      const text = compactText(stringifyContent(item));
      if (text) parts.push({ kind: 'text', text });
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      const text = compactText(record.text);
      if (text) parts.push({ kind: 'text', text });
      continue;
    }
    if (record.type === 'thinking' && typeof record.thinking === 'string') {
      const text = compactText(record.thinking);
      if (text) parts.push({ kind: 'thinking', text });
      continue;
    }
    if (record.type === 'toolCall' || record.type === 'tool_call' || record.type === 'tool_use') {
      const id = typeof record.id === 'string'
        ? record.id
        : typeof record.callId === 'string'
          ? record.callId
          : `pi-history-tool-${parts.length}`;
      const name = typeof record.name === 'string' ? record.name : 'tool';
      const rawArgs = record.arguments ?? record.args ?? record.input;
      const args = rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)
        ? cappedJsonObject(rawArgs as Record<string, unknown>)
        : {};
      parts.push({ kind: 'toolCall', id, name, args });
    }
  }
  return parts;
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

function toolCallId(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const record = message as Record<string, unknown>;
  return typeof record.toolCallId === 'string'
    ? record.toolCallId
    : typeof record.tool_use_id === 'string'
      ? record.tool_use_id
      : undefined;
}

export function mapPiSessionEntryToHistoryEnvelopes(entry: SessionEntry): SessionEnvelope[] {
  if (entry.type !== 'message') {
    return [];
  }

  const role = messageRole(entry.message);
  const time = entryTime(entry);
  const content = messageContent(entry.message);

  if (role === 'user') {
    const text = collectText(content);
    return text ? [createEnvelope('user', { t: 'text', text }, {
      id: `pi-history-${entry.id}-user`,
      time,
    })] : [];
  }

  if (role === 'assistant') {
    const turn = `pi-history-turn-${entry.id}`;
    const envelopes: SessionEnvelope[] = [
      createEnvelope('agent', { t: 'turn-start' }, { id: `pi-history-${entry.id}-start`, turn, time }),
    ];
    let index = 0;
    for (const part of collectAssistantParts(content)) {
      if (part.kind === 'toolCall') {
        envelopes.push(createEnvelope('agent', {
          t: 'tool-call-start',
          call: part.id,
          name: part.name,
          title: part.name,
          description: `Running ${part.name}`,
          args: part.args,
        }, { id: `pi-history-${entry.id}-tool-start-${index}`, turn, time: time + (++index) }));
        continue;
      }
      envelopes.push(createEnvelope('agent', {
        t: 'text',
        text: part.text,
        ...(part.kind === 'thinking' ? { thinking: true } : {}),
      }, { id: `pi-history-${entry.id}-${part.kind}-${index}`, turn, time: time + (++index) }));
    }
    envelopes.push(createEnvelope('agent', { t: 'turn-end', status: 'completed' }, { id: `pi-history-${entry.id}-end`, turn, time: time + (++index) }));
    return envelopes.length > 2 ? envelopes : [];
  }

  if (role === 'toolResult') {
    const turn = `pi-history-turn-${entry.id}`;
    const name = toolName(entry.message) ?? 'tool';
    const call = toolCallId(entry.message) ?? `pi-history-tool-${entry.id}`;
    const text = collectText(content);
    const envelopes: SessionEnvelope[] = [
      createEnvelope('agent', { t: 'turn-start' }, { id: `pi-history-${entry.id}-start`, turn, time }),
      createEnvelope('agent', {
        t: 'tool-call-start',
        call,
        name,
        title: name,
        description: `Running ${name}`,
        args: {},
      }, { id: `pi-history-${entry.id}-tool-start`, turn, time: time + 1 }),
    ];
    if (text) {
      envelopes.push(createEnvelope('agent', { t: 'text', text, thinking: true }, { id: `pi-history-${entry.id}-tool-output`, turn, time: time + 2 }));
    }
    envelopes.push(createEnvelope('agent', { t: 'tool-call-end', call }, { id: `pi-history-${entry.id}-tool-end`, turn, time: time + 3 }));
    envelopes.push(createEnvelope('agent', { t: 'turn-end', status: 'completed' }, { id: `pi-history-${entry.id}-end`, turn, time: time + 4 }));
    return envelopes;
  }

  return [];
}

export function mapPiSessionHistoryToEnvelopes(entries: SessionEntry[]): SessionEnvelope[] {
  const envelopes: SessionEnvelope[] = [];
  const startedToolCalls = new Set<string>();
  const openToolTurns = new Map<string, string>();
  const pendingToolCallCountByTurn = new Map<string, number>();
  const resultCallsInEntries = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== 'message' || messageRole(entry.message) !== 'toolResult') continue;
    const call = toolCallId(entry.message);
    if (call) resultCallsInEntries.add(call);
  }
  for (const entry of entries) {
    const messageEntry = entry.type === 'message' ? entry : null;
    const role = messageEntry ? messageRole(messageEntry.message) : undefined;
    if (role === 'toolResult') {
      const call = toolCallId(messageEntry?.message) ?? `pi-history-tool-${entry.id}`;
      const turn = openToolTurns.get(call);
      if (turn) {
        const time = entryTime(entry);
        const text = collectText(messageContent(messageEntry?.message));
        if (text) {
          envelopes.push(createEnvelope('agent', { t: 'text', text, thinking: true }, { id: `pi-history-${entry.id}-tool-output`, turn, time: time + 1 }));
        }
        envelopes.push(createEnvelope('agent', { t: 'tool-call-end', call }, { id: `pi-history-${entry.id}-tool-end`, turn, time: time + 2 }));
        const remaining = (pendingToolCallCountByTurn.get(turn) ?? 1) - 1;
        if (remaining <= 0) {
          pendingToolCallCountByTurn.delete(turn);
          envelopes.push(createEnvelope('agent', { t: 'turn-end', status: 'completed' }, { id: `pi-history-${entry.id}-end`, turn, time: time + 3 }));
        } else {
          pendingToolCallCountByTurn.set(turn, remaining);
        }
        openToolTurns.delete(call);
        continue;
      }
    }

    const entryEnvelopes = mapPiSessionEntryToHistoryEnvelopes(entry);
    const heldTurnCounts = new Map<string, number>();
    let shouldHoldTurnForToolResult = false;
    if (role === 'assistant') {
      shouldHoldTurnForToolResult = entryEnvelopes.some((envelope) => (
        envelope.ev.t === 'tool-call-start' && resultCallsInEntries.has(envelope.ev.call)
      ));
    }
    const filtered = entryEnvelopes.filter((envelope) => {
      if (envelope.ev.t === 'tool-call-start') {
        if (startedToolCalls.has(envelope.ev.call)) {
          return false;
        }
        startedToolCalls.add(envelope.ev.call);
        if (shouldHoldTurnForToolResult && envelope.turn && resultCallsInEntries.has(envelope.ev.call)) {
          openToolTurns.set(envelope.ev.call, envelope.turn);
          heldTurnCounts.set(envelope.turn, (heldTurnCounts.get(envelope.turn) ?? 0) + 1);
        }
      }
      if (shouldHoldTurnForToolResult && envelope.ev.t === 'turn-end') {
        return false;
      }
      return true;
    });
    for (const [turn, count] of heldTurnCounts) {
      pendingToolCallCountByTurn.set(turn, (pendingToolCallCountByTurn.get(turn) ?? 0) + count);
    }
    envelopes.push(...filtered);
  }
  return envelopes;
}

export type PiHistoryPage = {
  envelopes: SessionEnvelope[];
  nextCursor?: string;
  hasMore: boolean;
  totalMessages: number;
};

export type PiHistoryPageOptions = {
  beforeEntryId?: string;
  limit?: number;
  maxBytes?: number;
};

const DEFAULT_HISTORY_PAGE_MESSAGE_LIMIT = 50;
const MAX_HISTORY_PAGE_MESSAGE_LIMIT = 100;

function clampHistoryLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit ?? DEFAULT_HISTORY_PAGE_MESSAGE_LIMIT)) {
    return DEFAULT_HISTORY_PAGE_MESSAGE_LIMIT;
  }
  return Math.min(Math.max(Math.floor(limit ?? DEFAULT_HISTORY_PAGE_MESSAGE_LIMIT), 1), MAX_HISTORY_PAGE_MESSAGE_LIMIT);
}

function clampHistoryBytes(maxBytes: number | undefined): number {
  if (!Number.isFinite(maxBytes ?? DEFAULT_HISTORY_PAGE_BYTES)) {
    return DEFAULT_HISTORY_PAGE_BYTES;
  }
  return Math.min(Math.max(Math.floor(maxBytes ?? DEFAULT_HISTORY_PAGE_BYTES), 16_000), MAX_HISTORY_PAGE_BYTES);
}

function isRenderableHistoryEntry(entry: SessionEntry): boolean {
  if (entry.type !== 'message') return false;
  const role = messageRole(entry.message);
  return role === 'user' || role === 'assistant' || role === 'toolResult';
}

function fallbackHistoryEnvelope(envelopes: SessionEnvelope[], maxBytes: number): SessionEnvelope[] {
  const first = envelopes[0];
  if (!first) {
    return [];
  }
  const text = truncateTextToBytes(HISTORY_TRUNCATED_TEXT, Math.max(256, Math.floor(maxBytes / 2)));
  if (first.role === 'user') {
    return [createEnvelope('user', { t: 'text', text }, {
      id: `${first.id}-truncated`,
      time: first.time,
    })];
  }
  const turn = first.turn ?? `${first.id}-turn`;
  return [
    createEnvelope('agent', { t: 'turn-start' }, { id: `${first.id}-truncated-start`, turn, time: first.time }),
    createEnvelope('agent', { t: 'text', text, thinking: true }, { id: `${first.id}-truncated-text`, turn, time: first.time + 1 }),
    createEnvelope('agent', { t: 'turn-end', status: 'completed' }, { id: `${first.id}-truncated-end`, turn, time: first.time + 2 }),
  ];
}

function capHistoryEnvelopes(envelopes: SessionEnvelope[], maxBytes: number): SessionEnvelope[] {
  let capped = envelopes.map((envelope) => ({
    ...envelope,
    ev: { ...envelope.ev },
  }));
  if (byteLength(JSON.stringify(capped)) <= maxBytes) {
    return capped;
  }

  capped = capped.map((envelope) => {
    if (envelope.ev.t !== 'tool-call-start') {
      return envelope;
    }
    return {
      ...envelope,
      ev: {
        ...envelope.ev,
        args: { truncated: true },
      },
    };
  });

  for (let attempt = 0; attempt < 100 && byteLength(JSON.stringify(capped)) > maxBytes; attempt++) {
    let largestIndex = -1;
    let largestBytes = 0;
    for (let index = 0; index < capped.length; index++) {
      const envelope = capped[index];
      if (envelope.ev.t !== 'text') {
        continue;
      }
      const size = byteLength(envelope.ev.text);
      if (size > largestBytes) {
        largestBytes = size;
        largestIndex = index;
      }
    }
    if (largestIndex < 0 || largestBytes <= HISTORY_TRUNCATION_MARKER.length) {
      break;
    }
    const currentBytes = byteLength(JSON.stringify(capped));
    const targetTextBytes = Math.max(0, largestBytes - (currentBytes - maxBytes) - 4096);
    const envelope = capped[largestIndex];
    if (envelope.ev.t === 'text') {
      capped[largestIndex] = {
        ...envelope,
        ev: {
          ...envelope.ev,
          text: truncateTextToBytes(envelope.ev.text, targetTextBytes),
        },
      };
    }
  }

  if (byteLength(JSON.stringify(capped)) <= maxBytes) {
    return capped;
  }
  return fallbackHistoryEnvelope(capped, maxBytes);
}

export function mapPiSessionHistoryPageToEnvelopes(
  entries: SessionEntry[],
  options: PiHistoryPageOptions = {},
): PiHistoryPage {
  const renderableEntries = entries.filter(isRenderableHistoryEntry);
  const limit = clampHistoryLimit(options.limit);
  const maxBytes = clampHistoryBytes(options.maxBytes);
  const beforeIndex = options.beforeEntryId
    ? renderableEntries.findIndex((entry) => entry.id === options.beforeEntryId)
    : renderableEntries.length;
  const endExclusive = beforeIndex >= 0 ? beforeIndex : renderableEntries.length;
  let start = endExclusive;
  let estimatedBytes = 0;
  while (start > 0 && endExclusive - start < limit) {
    const entry = renderableEntries[start - 1];
    const entryBytes = byteLength(JSON.stringify(entry));
    if (start < endExclusive && estimatedBytes + entryBytes > maxBytes) {
      break;
    }
    estimatedBytes += entryBytes;
    start--;
  }
  const firstPageEntry = renderableEntries[start];
  if (start > 0 && firstPageEntry?.type === 'message' && messageRole(firstPageEntry.message) === 'toolResult') {
    const parentId = firstPageEntry.parentId;
    if (parentId) {
      for (let index = start - 1; index >= 0; index--) {
        if (renderableEntries[index].id === parentId) {
          start = index;
          break;
        }
      }
    }
  }
  let pageEntries = renderableEntries.slice(start, endExclusive);
  let envelopes = capHistoryEnvelopes(mapPiSessionHistoryToEnvelopes(pageEntries), maxBytes);
  while (pageEntries.length > 1 && byteLength(JSON.stringify(envelopes)) > maxBytes) {
    pageEntries = pageEntries.slice(1);
    start++;
    envelopes = capHistoryEnvelopes(mapPiSessionHistoryToEnvelopes(pageEntries), maxBytes);
  }

  return {
    envelopes,
    nextCursor: start > 0 ? pageEntries[0]?.id : undefined,
    hasMore: start > 0,
    totalMessages: renderableEntries.length,
  };
}
