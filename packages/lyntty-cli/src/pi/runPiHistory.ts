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
        ? rawArgs as Record<string, unknown>
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
  for (const entry of entries) {
    const entryEnvelopes = mapPiSessionEntryToHistoryEnvelopes(entry);
    const filtered = entryEnvelopes.filter((envelope) => {
      if (envelope.ev.t === 'tool-call-start') {
        if (startedToolCalls.has(envelope.ev.call)) {
          return false;
        }
        startedToolCalls.add(envelope.ev.call);
      }
      return true;
    });
    envelopes.push(...filtered);
  }
  return envelopes;
}
