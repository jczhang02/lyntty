import React, { useCallback } from 'react';
import { View, Text, Animated } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Avatar } from '@/components/Avatar';
import { useSession, useIsDataReady } from '@/sync/storage';
import { getSessionName, useSessionStatus, formatPathRelativeToHome, getSessionAvatarId } from '@/utils/sessionUtils';
import { Modal } from '@/modal';
import { sessionKill, sessionDelete } from '@/sync/ops';
import { stopAndArchiveSession } from '@/sync/archiveSessionAction';
import { maybeCleanupWorktree } from '@/hooks/useWorktreeCleanup';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { Session } from '@/sync/storageTypes';
import { useLynttyAction } from '@/hooks/useLynttyAction';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { LynttyError } from '@/utils/errors';
import { navigateAfterSessionArchive } from '@/utils/archiveNavigation';

// Animated status dot component
function StatusDot({ color, isPulsing, size = 8 }: { color: string; isPulsing?: boolean; size?: number }) {
    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isPulsing) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.3,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isPulsing, pulseAnim]);

    return (
        <Animated.View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity: pulseAnim,
                marginRight: 4,
            }}
        />
    );
}

function SessionInfoContent({ session }: { session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const sessionName = getSessionName(session);
    const sessionStatus = useSessionStatus(session);
    const {
        canShowResume,
        resumeSession,
        resumeSessionSubtitle,
    } = useSessionQuickActions(session);

    // Check if CLI version is outdated
    const isCliOutdated = session.metadata?.version && !isVersionSupported(session.metadata.version, MINIMUM_CLI_VERSION);

    // Archive through the shared action helper so recoverable errors surface consistently.
    const [archivingSession, performArchive] = useLynttyAction(async () => {
        // Prompt for worktree cleanup before killing (needs an active machine connection)
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId);

        const result = await stopAndArchiveSession(session);
        if (!result.success) {
            throw new LynttyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
        navigateAfterSessionArchive(router);
    });

    const handleArchiveSession = useCallback(() => {
        performArchive();
    }, [performArchive]);

    // Delete through the shared action helper; kill the active runtime first when needed.
    const [deletingSession, performDelete] = useLynttyAction(async () => {
        // Prompt for worktree cleanup before killing (needs an active machine connection)
        await maybeCleanupWorktree(session.id, session.metadata?.path, session.metadata?.machineId);

        // Navigate back optimistically
        router.back();
        router.back();

        // Kill session first if it's still active (best-effort)
        if (sessionStatus.isConnected || session.active) {
            await sessionKill(session.id).catch(() => {});
        }

        const result = await sessionDelete(session.id);
        if (!result.success) {
            throw new LynttyError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
    });

    const handleDeleteSession = useCallback(() => {
        Modal.alert(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSessionWarning'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.deleteSession'),
                    style: 'destructive',
                    onPress: performDelete
                }
            ]
        );
    }, [performDelete]);

    const formatDate = useCallback((timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    }, []);

    return (
        <>
            <ItemList>
                {/* Session Header */}
                <View style={{ maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }}>
                    <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: theme.colors.surface, marginBottom: 8, borderRadius: 12, marginHorizontal: 16, marginTop: 16 }}>
                        <Avatar id={getSessionAvatarId(session)} size={80} monochrome={!sessionStatus.isConnected} flavor={session.metadata?.flavor} />
                        <Text style={{
                            fontSize: 20,
                            fontWeight: '600',
                            marginTop: 12,
                            textAlign: 'center',
                            color: theme.colors.text,
                            ...Typography.default('semiBold')
                        }}>
                            {sessionName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <StatusDot color={sessionStatus.statusDotColor} isPulsing={sessionStatus.isPulsing} size={10} />
                            <Text style={{
                                fontSize: 15,
                                color: sessionStatus.statusColor,
                                fontWeight: '500',
                                ...Typography.default()
                            }}>
                                {sessionStatus.statusText}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* CLI Version Warning */}
                {isCliOutdated && (
                    <ItemGroup>
                        <Item
                            title={t('sessionInfo.cliVersionOutdated')}
                            subtitle={t('sessionInfo.updateCliInstructions')}
                            icon={<Ionicons name="warning-outline" size={29} color="#FF9500" />}
                            showChevron={false}
                        />
                    </ItemGroup>
                )}

                {/* Session Details */}
                <ItemGroup>
                    <Item
                        title={t('sessionInfo.connectionStatus')}
                        detail={sessionStatus.isConnected ? t('status.online') : t('status.offline')}
                        icon={<Ionicons name="pulse-outline" size={29} color={sessionStatus.isConnected ? "#34C759" : "#8E8E93"} />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.created')}
                        subtitle={formatDate(session.createdAt)}
                        icon={<Ionicons name="calendar-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.lastUpdated')}
                        subtitle={formatDate(session.updatedAt)}
                        icon={<Ionicons name="time-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Quick Actions */}
                <ItemGroup title={t('sessionInfo.quickActions')}>
                    {session.metadata?.machineId && (
                        <Item
                            title={t('sessionInfo.viewMachine')}
                            subtitle={t('sessionInfo.viewMachineSubtitle')}
                            icon={<Ionicons name="server-outline" size={29} color="#007AFF" />}
                            onPress={() => router.push(`/machine/${session.metadata?.machineId}`)}
                        />
                    )}
                    {canShowResume && (
                        <Item
                            title={t('sessionInfo.resumeSession')}
                            subtitle={resumeSessionSubtitle}
                            icon={<Ionicons name="play-circle-outline" size={29} color="#007AFF" />}
                            onPress={resumeSession}
                        />
                    )}
                    <Item
                        title={t('sessionInfo.stopAndArchiveSession')}
                        subtitle={t('sessionInfo.archiveSessionSubtitle')}
                        icon={<Ionicons name="archive-outline" size={29} color="#FF3B30" />}
                        onPress={handleArchiveSession}
                    />
                    <Item
                        title={t('sessionInfo.deleteSession')}
                        subtitle={t('sessionInfo.deleteSessionSubtitle')}
                        icon={<Ionicons name="trash-outline" size={29} color="#FF3B30" />}
                        onPress={handleDeleteSession}
                    />
                </ItemGroup>

                {/* Metadata */}
                {session.metadata && (
                    <ItemGroup title={t('sessionInfo.metadata')}>
                        <Item
                            title={t('sessionInfo.host')}
                            subtitle={session.metadata.host}
                            icon={<Ionicons name="desktop-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        <Item
                            title={t('sessionInfo.path')}
                            subtitle={formatPathRelativeToHome(session.metadata.path, session.metadata.homeDir)}
                            icon={<Ionicons name="folder-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                    </ItemGroup>
                )}
            </ItemList>
        </>
    );
}

export default React.memo(() => {
    const { theme } = useUnistyles();
    const { id } = useLocalSearchParams<{ id: string }>();
    const session = useSession(id);
    const isDataReady = useIsDataReady();

    // Handle three states: loading, deleted, and exists
    if (!isDataReady) {
        // Still loading data
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="hourglass-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 17, marginTop: 16, ...Typography.default('semiBold') }}>{t('common.loading')}</Text>
            </View>
        );
    }

    if (!session) {
        // Session has been deleted or doesn't exist
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, ...Typography.default('semiBold') }}>{t('errors.sessionDeleted')}</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, ...Typography.default() }}>{t('errors.sessionDeletedDescription')}</Text>
            </View>
        );
    }

    return <SessionInfoContent session={session} />;
});
