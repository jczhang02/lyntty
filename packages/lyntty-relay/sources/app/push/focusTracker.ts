/**
 * Checks whether a user is actively looking at a specific Session Remote.
 *
 * Push suppression is intentionally fail-open: only an active non-machine
 * socket with matching visibleSessionId suppresses session-event pushes.
 * Old clients that never send visibleSessionId do not suppress.
 *
 * State lives on `socket.data.appState` — set by the `app-state` socket
 * event in socket.ts. No external storage (Redis, Maps) needed: when a
 * socket disconnects the state disappears automatically.
 */

import { eventRouter } from "@/app/events/eventRouter";

export async function isUserViewingSession(userId: string, sessionId: string): Promise<boolean> {
    return eventRouter.hasActiveNonMachineSocketForSession(userId, sessionId);
}
