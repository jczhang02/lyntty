import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEnvelope } from 'lyntty-wire';

import { flushPendingPiLiveText, markPiExtensionAssistantTextDelivered } from './run';

afterEach(() => {
  vi.useRealTimers();
});

describe('Pi extension delivery bookkeeping', () => {
  it('marks flushed live assistant text immediately so JSONL fallback can dedupe it', async () => {
    vi.useFakeTimers();
    const deliveredEntries = vi.fn();
    const deliveredAssistantText = vi.fn();
    const sendSessionProtocolMessage = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const pendingTextFlushTimer = setTimeout(() => undefined, 10_000);
    const mirror = {
      markCurrentEntriesDeliveredSince: deliveredEntries,
      markUserTextDeliveredSince: vi.fn(),
      markAssistantTextDeliveredSince: deliveredAssistantText,
      capAssistantTextDeliveryWindow: vi.fn(),
      deliveredAssistantTextInTurn: '',
      pendingTextFlushTimer,
      sessionClient: { sendSessionProtocolMessage, flush },
      mapper: {
        flushPendingText: () => [
          createEnvelope('agent', { t: 'text', text: 'live partial answer' }, { turn: 'turn-1', time: 1_000 }),
        ],
      },
    };

    await flushPendingPiLiveText(mirror, 900);

    expect(mirror.pendingTextFlushTimer).toBeNull();
    expect(sendSessionProtocolMessage).toHaveBeenCalledWith(expect.objectContaining({
      role: 'agent',
      ev: { t: 'text', text: 'live partial answer' },
    }));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(deliveredEntries).toHaveBeenCalledWith(900, {});
    expect(deliveredAssistantText).toHaveBeenCalledWith('live partial answer', 900);
  });

  it('normalizes assistant text before marking fallback dedupe', () => {
    vi.useFakeTimers();
    const markAssistantTextDeliveredSince = vi.fn();

    markPiExtensionAssistantTextDelivered({ markAssistantTextDeliveredSince }, '  repeated answer  ', 123);

    expect(markAssistantTextDeliveredSince).toHaveBeenCalledWith('repeated answer', 123);
  });
});
