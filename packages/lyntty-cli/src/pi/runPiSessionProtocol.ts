import { createId } from '@paralleldrive/cuid2';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { createEnvelope, type CreateEnvelopeOptions, type SessionEnvelope, type SessionTurnEndStatus } from 'lyntty-wire';

const PI_SYSTEM_TURN_ID = 'pi-system';

type PendingTextType = 'text' | 'thinking';

function stableOptions(turnId: string | null, time: number): CreateEnvelopeOptions {
  return turnId ? { turn: turnId, time } : { turn: PI_SYSTEM_TURN_ID, time };
}

function stringifyToolPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return '';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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

export class PiSessionProtocolMapper {
  private currentTurnId: string | null = null;
  private readonly piCallToSessionCall = new Map<string, string>();
  private lastTime = 0;
  private pendingText = '';
  private pendingType: PendingTextType | null = null;

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
    envelopes.push(createEnvelope('agent', { t: 'turn-end', status }, { turn: turnId, time: this.nextTime() }));
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
      case 'tool_execution_update': {
        const output = stringifyToolPayload(event.partialResult);
        return output ? this.appendText('thinking', output) : [];
      }
      case 'tool_execution_end': {
        const envelopes = this.flush();
        const call = this.ensureSessionCallId(event.toolCallId);
        if (event.isError) {
          const output = stringifyToolPayload(event.result);
          if (output) {
            envelopes.push(createEnvelope('agent', { t: 'text', text: output, thinking: true }, this.turnOptions()));
          }
        }
        envelopes.push(createEnvelope('agent', { t: 'tool-call-end', call }, this.turnOptions()));
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
