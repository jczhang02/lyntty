import type { Session } from './storageTypes';

type SessionRecencyLike = Pick<Partial<Session>, 'createdAt' | 'updatedAt'>;

export function sessionRecencyAt(session: SessionRecencyLike): number {
    return session.updatedAt ?? session.createdAt ?? 0;
}

export function compareSessionsByRecencyDesc(
    a: SessionRecencyLike,
    b: SessionRecencyLike,
): number {
    return sessionRecencyAt(b) - sessionRecencyAt(a);
}

export function nextSessionUpdatedAt(currentUpdatedAt: number, latestMessageAt: number): number {
    return latestMessageAt > currentUpdatedAt ? latestMessageAt : currentUpdatedAt;
}
