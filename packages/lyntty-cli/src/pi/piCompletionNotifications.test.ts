import { describe, expect, it, vi } from 'vitest';
import type { Metadata } from '@/api/types';

import {
  consumePiCompletionNotificationDecision,
  PiCompletionNotificationTracker,
  sendPiDoneNotification,
} from './piCompletionNotifications';

function makeMetadata(overrides: Partial<Metadata> = {}): Metadata {
  return {
    path: '/Users/test/projects/lyntty',
    host: 'test-host',
    homeDir: '/Users/test',
    lynttyHomeDir: '/Users/test/.lyntty',
    lynttyLibDir: '/Users/test/.lyntty/lib',
    lynttyToolsDir: '/Users/test/.lyntty/tools',
    flavor: 'pi',
    ...overrides,
  };
}

describe('PiCompletionNotificationTracker', () => {
  it('ignores isolated agent_end events', () => {
    const tracker = new PiCompletionNotificationTracker();

    expect(consumePiCompletionNotificationDecision(tracker, {
      canNotify: true,
      hasActiveManagedRuntime: false,
    })).toBe(false);
  });

  it('notifies once after a live agent_start to agent_end turn', () => {
    const tracker = new PiCompletionNotificationTracker();
    tracker.markAgentStart();

    expect(consumePiCompletionNotificationDecision(tracker, {
      canNotify: true,
      hasActiveManagedRuntime: false,
    })).toBe(true);
    expect(consumePiCompletionNotificationDecision(tracker, {
      canNotify: true,
      hasActiveManagedRuntime: false,
    })).toBe(false);
  });

  it('suppresses aborted turns', () => {
    const tracker = new PiCompletionNotificationTracker();
    tracker.markAgentStart();
    tracker.suppressCurrentTurn();

    expect(consumePiCompletionNotificationDecision(tracker, {
      canNotify: true,
      hasActiveManagedRuntime: false,
    })).toBe(false);
  });

  it('suppresses extension sessions that cannot notify', () => {
    const tracker = new PiCompletionNotificationTracker();
    tracker.markAgentStart();

    expect(consumePiCompletionNotificationDecision(tracker, {
      canNotify: false,
      hasActiveManagedRuntime: false,
    })).toBe(false);
  });

  it('suppresses extension mirror notifications when managed Pi runtime owns the session', () => {
    const tracker = new PiCompletionNotificationTracker();
    tracker.markAgentStart();

    expect(consumePiCompletionNotificationDecision(tracker, {
      canNotify: true,
      hasActiveManagedRuntime: true,
    })).toBe(false);
  });
});

describe('sendPiDoneNotification', () => {
  it('uses existing done notification copy and Pi routing data', () => {
    const sendSessionNotification = vi.fn();
    const metadata = makeMetadata({ name: 'Pi session' });

    sendPiDoneNotification(
      { sendSessionNotification },
      {
        sessionId: 'relay-session-1',
        getMetadata: () => metadata,
      },
    );

    expect(sendSessionNotification).toHaveBeenCalledWith({
      kind: 'done',
      metadata,
      data: {
        sessionId: 'relay-session-1',
        type: 'ready',
        provider: 'pi',
      },
    });
  });
});
