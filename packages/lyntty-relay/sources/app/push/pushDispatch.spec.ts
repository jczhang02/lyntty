import { beforeEach, describe, expect, it, mock } from 'bun:test';

const {
    accountPushTokenFindMany,
    accountPushTokenDeleteMany,
    isUserViewingSessionMock,
    sendPushNotificationsMock,
    logMock,
} = {
    accountPushTokenFindMany: mock(),
    accountPushTokenDeleteMany: mock(),
    isUserViewingSessionMock: mock(),
    sendPushNotificationsMock: mock(),
    logMock: mock(),
};

mock.module('@/storage/db', () => ({
    db: {
        accountPushToken: {
            findMany: accountPushTokenFindMany,
            deleteMany: accountPushTokenDeleteMany,
        },
    },
}));
mock.module('@/app/push/focusTracker', () => ({ isUserViewingSession: isUserViewingSessionMock }));
mock.module('@/app/push/pushSend', () => ({ sendPushNotifications: sendPushNotificationsMock }));
mock.module('@/utils/log', () => ({ log: logMock }));

import { dispatchSessionEventPush } from './pushDispatch';

describe('dispatchSessionEventPush', () => {
    beforeEach(() => {
        accountPushTokenFindMany.mockReset();
        accountPushTokenDeleteMany.mockReset();
        isUserViewingSessionMock.mockReset();
        sendPushNotificationsMock.mockReset();
        logMock.mockReset();
    });

    it('suppresses only when the same session is actively visible', async () => {
        isUserViewingSessionMock.mockResolvedValue(true);

        await dispatchSessionEventPush({
            userId: 'user-1',
            sessionId: 'session-1',
            title: "It's ready!",
            body: 'project',
            data: { kind: 'done' },
        });

        expect(isUserViewingSessionMock).toHaveBeenCalledWith('user-1', 'session-1');
        expect(accountPushTokenFindMany).not.toHaveBeenCalled();
        expect(sendPushNotificationsMock).not.toHaveBeenCalled();
        expect(logMock).toHaveBeenCalledWith(
            { module: 'push' },
            'Suppressed session-event push for user user-1 session session-1: same session visible'
        );
    });

    it('sends when no client is viewing the target session', async () => {
        isUserViewingSessionMock.mockResolvedValue(false);
        accountPushTokenFindMany.mockResolvedValue([
            { id: 'token-row-1', token: 'ExponentPushToken[test]' },
        ]);
        sendPushNotificationsMock.mockResolvedValue([{ status: 'ok' }]);

        await dispatchSessionEventPush({
            userId: 'user-1',
            sessionId: 'session-1',
            title: 'Permission request',
            body: 'project',
            data: { kind: 'permission' },
        });

        expect(accountPushTokenFindMany).toHaveBeenCalledWith({ where: { accountId: 'user-1' } });
        expect(sendPushNotificationsMock).toHaveBeenCalledWith([
            {
                to: 'ExponentPushToken[test]',
                title: 'Permission request',
                body: 'project',
                data: { sessionId: 'session-1', kind: 'permission' },
                sound: 'default',
                channelId: 'messages',
            },
        ]);
    });
});
