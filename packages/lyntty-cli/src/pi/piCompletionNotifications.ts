import type { ApiSessionClient } from '@/api/apiSession';
import type { PushNotificationClient } from '@/api/pushNotifications';

export class PiCompletionNotificationTracker {
  private liveTurnStarted = false;
  private currentTurnSuppressed = false;

  markAgentStart(): void {
    this.liveTurnStarted = true;
    this.currentTurnSuppressed = false;
  }

  suppressCurrentTurn(): void {
    if (!this.liveTurnStarted) return;
    this.currentTurnSuppressed = true;
  }

  reset(): void {
    this.liveTurnStarted = false;
    this.currentTurnSuppressed = false;
  }

  hasLiveTurnStarted(): boolean {
    return this.liveTurnStarted;
  }

  consumeAgentEnd(): boolean {
    const shouldNotify = this.liveTurnStarted && !this.currentTurnSuppressed;
    this.reset();
    return shouldNotify;
  }
}

export function consumePiCompletionNotificationDecision(
  tracker: PiCompletionNotificationTracker,
  options: { canNotify: boolean; hasActiveManagedRuntime: boolean },
): boolean {
  const completedLiveTurn = tracker.consumeAgentEnd();
  return completedLiveTurn && options.canNotify && !options.hasActiveManagedRuntime;
}

export function sendPiDoneNotification(
  pushClient: Pick<PushNotificationClient, 'sendSessionNotification'>,
  session: Pick<ApiSessionClient, 'sessionId' | 'getMetadata'>,
): void {
  pushClient.sendSessionNotification({
    kind: 'done',
    metadata: session.getMetadata(),
    data: {
      sessionId: session.sessionId,
      type: 'ready',
      provider: 'pi',
    },
  });
}
