import { createId } from '@paralleldrive/cuid2';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { createEnvelope, type CreateEnvelopeOptions, type SessionEnvelope, type SessionTurnEndStatus } from 'lyntty-wire';

const PI_SYSTEM_TURN_ID = 'pi-system';
const MAX_TOOL_RESULT_LENGTH = 20_000;
const TOOL_RESULT_TRUNCATION_MARKER = '\n\n[truncated by Lyntty tool-result import]';

type PendingTextType = 'text' | 'thinking';

function stableOptions(turnId: string | null, time: number): CreateEnvelopeOptions {
  return turnId ? { turn: turnId, time } : { turn: PI_SYSTEM_TURN_ID, time };
}

function stringifyToolPayload(value: unknown): string {
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else if (value === undefined || value === null) {
    return '';
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  if (text.length <= MAX_TOOL_RESULT_LENGTH) {
    return text;
  }
  return `${text.slice(0, MAX_TOOL_RESULT_LENGTH)}${TOOL_RESULT_TRUNCATION_MARKER}`;
}

function buildToolDescription(toolName: string): string {
  return `Running ${toolName}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .flatMap((part) => {
      if (!part || typeof part !== 'object') return [];
      const record = part as { type?: unknown; text?: unknown };
      return record.type === 'text' && typeof record.text === 'string' ? [record.text] : [];
    })
    .join('');
}

export class PiSessionProtocolMapper {
  private currentTurnId: string | null = null;
  private readonly piCallToSessionCall = new Map<string, string>();
  private lastTime = 0;
  private pendingText = '';
  private pendingType: PendingTextType | null = null;
  private emittedText = '';

  private nextTime(): number {
    this.lastTime = Math.max(this.lastTime + 1, Date.now());
    return this.lastTime;
  }

  private turnOptions(): CreateEnvelopeOptions {
    return stableOptions(this.currentTurnId, this.nextTime());
  }

  private ensureTurn(): SessionEnvelope[] {
    if (this.currentTurnId) {
      return [];
    }

    this.currentTurnId = createId();
    this.piCallToSessionCall.clear();
    this.emittedText = '';
    return [createEnvelope('agent', { t: 'turn-start' }, this.turnOptions())];
  }

  private ensureSessionCallId(piCallId: string): string {
    const existing = this.piCallToSessionCall.get(piCallId);
    if (existing) {
      return existing;
    }

    const created = createId();
    this.piCallToSessionCall.set(piCallId, created);
    return created;
  }

  private flush(): SessionEnvelope[] {
    if (!this.pendingText || !this.pendingType) {
      return [];
    }

    const text = this.pendingText.replace(/^\n+|\n+$/g, '');
    const type = this.pendingType;
    this.pendingText = '';
    this.pendingType = null;

    if (!text) {
      return [];
    }

    if (type === 'text') {
      this.emittedText += text;
    }

    return [createEnvelope('agent', {
      t: 'text',
      text,
      ...(type === 'thinking' ? { thinking: true } : {}),
    }, this.turnOptions())];
  }

  private appendText(type: PendingTextType, text: string): SessionEnvelope[] {
    if (!text) {
      return [];
    }

    const envelopes = this.ensureTurn();
    if (this.pendingType !== type) {
      envelopes.push(...this.flush());
      this.pendingType = type;
    }
    this.pendingText += text;
    return envelopes;
  }

  hasPendingText(): boolean {
    return !!this.pendingText && !!this.pendingType;
  }

  flushPendingText(): SessionEnvelope[] {
    return this.flush();
  }

  startTurn(): SessionEnvelope[] {
    return this.ensureTurn();
  }

  endTurn(status: SessionTurnEndStatus): SessionEnvelope[] {
    const envelopes = this.flush();
    if (!this.currentTurnId) {
      return envelopes;
    }

    const turnId = this.currentTurnId;
    this.currentTurnId = null;
    this.piCallToSessionCall.clear();
    this.emittedText = '';
    envelopes.push(createEnvelope('agent', { t: 'turn-end', status }, { turn: turnId, time: this.nextTime() }));
    return envelopes;
  }

  private completeAssistantMessage(message: unknown): SessionEnvelope[] {
    const role = message && typeof message === 'object' ? (message as { role?: unknown }).role : undefined;
    if (role !== 'assistant') return [];
    const finalText = extractTextContent((message as { content?: unknown }).content).replace(/^\n+|\n+$/g, '');
    if (!finalText) return [];
    const envelopes = this.ensureTurn();
    envelopes.push(...this.flush());
    if (!finalText.startsWith(this.emittedText)) {
      return envelopes;
    }
    const suffix = finalText.slice(this.emittedText.length).replace(/^\n+|\n+$/g, '');
    if (!suffix) return envelopes;
    this.emittedText += suffix;
    envelopes.push(createEnvelope('agent', { t: 'text', text: suffix }, this.turnOptions()));
    return envelopes;
  }

  mapEvent(event: AgentSessionEvent): SessionEnvelope[] {
    switch (event.type) {
      case 'agent_start':
        return this.startTurn();
      case 'agent_end':
        return this.endTurn('completed');
      case 'message_update':
        if (event.assistantMessageEvent.type === 'text_delta') {
          return this.appendText('text', event.assistantMessageEvent.delta);
        }
        if (event.assistantMessageEvent.type === 'thinking_delta') {
          return this.appendText('thinking', event.assistantMessageEvent.delta);
        }
        return [];
      case 'message_end':
        return this.completeAssistantMessage((event as unknown as { message?: unknown }).message);
      case 'tool_execution_start': {
        const envelopes = [...this.ensureTurn(), ...this.flush()];
        const call = this.ensureSessionCallId(event.toolCallId);
        envelopes.push(createEnvelope('agent', {
          t: 'tool-call-start',
          call,
          name: event.toolName,
          title: event.toolName,
          description: buildToolDescription(event.toolName),
          args: toRecord(event.args),
        }, this.turnOptions()));
        return envelopes;
      }
      case 'tool_execution_update':
        // Pi streams partial tool output while the tool is still running. The
        // final structured payload arrives on tool_execution_end and is rendered
        // by the app inside the folded tool card. Emitting partial output as
        // thinking text makes raw JSON/stdout appear in the chat timeline.
        return [];
      case 'tool_execution_end': {
        const envelopes = this.flush();
        const call = this.ensureSessionCallId(event.toolCallId);
        const result = stringifyToolPayload(event.result);
        envelopes.push(createEnvelope('agent', {
          t: 'tool-call-end',
          call,
          ...(result ? { result } : {}),
          ...(event.isError ? { isError: true } : {}),
        }, this.turnOptions()));
        return envelopes;
      }
      case 'queue_update':
      case 'compaction_start':
      case 'compaction_end':
      case 'auto_retry_start':
      case 'auto_retry_end':
        return [];
      default:
        return [];
    }
  }
}
