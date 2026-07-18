import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, Pressable, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Typography } from '@/constants/Typography';
import { useSessions, useAllMachines, useMachine } from '@/sync/storage';
import { Ionicons, Octicons } from '@expo/vector-icons';
import type { Session } from '@/sync/storageTypes';
import {
    machineDelete,
    machineEnsurePiSessionMirror,
    machineListPiSessions,
    machineSpawnNewSession,
    machineStopDaemon,
    machineUpdateMetadata,
    type PiMachineSessionRecord,
} from '@/sync/ops';
import { Modal } from '@/modal';
import { shouldShowPiDiscoveredRecord } from '@/sync/piDiscoveredSessions';
import { formatPathRelativeToHome, getSessionName, getSessionSubtitle } from '@/utils/sessionUtils';
import { isMachineOnline } from '@/utils/machineUtils';
import { sync } from '@/sync/sync';
import { useUnistyles, StyleSheet } from 'react-native-unistyles';
import { t } from '@/text';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { MultiTextInput, type MultiTextInputHandle } from '@/components/MultiTextInput';

const styles = StyleSheet.create((theme) => ({
    pathInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    pathInput: {
        flex: 1,
        borderRadius: 8,
        backgroundColor: theme.colors.input?.background ?? theme.colors.groupped.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        minHeight: 44,
        position: 'relative',
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    inlineSendButton: {
        position: 'absolute',
        right: 8,
        bottom: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    inlineSendActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    inlineSendInactive: {
        // Use a darker neutral in light theme to avoid blending into input
        backgroundColor: theme.colors.permissionButton?.inactive?.background ?? theme.colors.surfaceHigh,
    },
}));

export default function MachineDetailScreen() {
    const { theme } = useUnistyles();
    const { id: machineId } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const sessions = useSessions();
    const machine = useMachine(machineId!);
    const navigateToSession = useNavigateToSession();
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isStoppingDaemon, setIsStoppingDaemon] = useState(false);
    const [isRenamingMachine, setIsRenamingMachine] = useState(false);
    const [isDeletingMachine, setIsDeletingMachine] = useState(false);
    const [customPath, setCustomPath] = useState('');
    const [isSpawning, setIsSpawning] = useState(false);
    const [isLoadingPiSessions, setIsLoadingPiSessions] = useState(false);
    const [piSessions, setPiSessions] = useState<PiMachineSessionRecord[]>([]);
    const [piSessionsError, setPiSessionsError] = useState<string | null>(null);
    const inputRef = useRef<MultiTextInputHandle>(null);
    const [showAllPaths, setShowAllPaths] = useState(false);
    // Variant D only

    const machineSessions = useMemo(() => {
        if (!sessions || !machineId) return [];

        return sessions.filter(item => {
            if (typeof item === 'string') return false;
            const session = item as Session;
            return session.metadata?.machineId === machineId;
        }) as Session[];
    }, [sessions, machineId]);

    const previousSessions = useMemo(() => {
        return [...machineSessions]
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .slice(0, 5);
    }, [machineSessions]);

    const recentPaths = useMemo(() => {
        const paths = new Set<string>();
        machineSessions.forEach(session => {
            if (session.metadata?.path) {
                paths.add(session.metadata.path);
            }
        });
        return Array.from(paths).sort();
    }, [machineSessions]);

    const pathsToShow = useMemo(() => {
        if (showAllPaths) return recentPaths;
        return recentPaths.slice(0, 5);
    }, [recentPaths, showAllPaths]);

    // Determine daemon status from metadata
    const daemonStatus = useMemo(() => {
        if (!machine) return 'offline';

        // Check metadata for daemon status
        const metadata = machine.metadata as any;
        if (metadata?.daemonLastKnownStatus === 'shutting-down') {
            return 'offline';
        }

        // Use machine online status as proxy for daemon status
        return isMachineOnline(machine) ? 'online' : 'offline';
    }, [machine]);

    const handleStopDaemon = async () => {
        // Show confirmation modal using alert with buttons
        Modal.alert(
            t('appWide.stopDaemon'),
            t('appWide.youWillNotBeAbleToSpawnNewSessions'),
            [
                {
                    text: t('appWide.cancel'),
                    style: 'cancel'
                },
                {
                    text: t('appWide.stopDaemon2'),
                    style: 'destructive',
                    onPress: async () => {
                        setIsStoppingDaemon(true);
                        try {
                            const result = await machineStopDaemon(machineId!);
                            Modal.alert(t('appWide.daemonStopped'), result.message);
                            // Refresh to get updated metadata
                            await sync.refreshMachines();
                        } catch (error) {
                            Modal.alert(t('common.error'), t('appWide.failedToStopDaemonItMayNotBeRunning'));
                        } finally {
                            setIsStoppingDaemon(false);
                        }
                    }
                }
            ]
        );
    };

    // inline control below

    const refreshPiSessions = useCallback(async () => {
        if (!machineId || !machine || !isMachineOnline(machine)) {
            setPiSessions([]);
            setPiSessionsError(null);
            return;
        }

        setIsLoadingPiSessions(true);
        const sessions: PiMachineSessionRecord[] = [];
        let cursor: string | undefined;
        let errorMessage: string | null = null;
        do {
            const result = await machineListPiSessions({ machineId, scope: 'machine', limit: 100, cursor });
            if (result.type !== 'success') {
                errorMessage = result.errorMessage;
                break;
            }
            sessions.push(...result.sessions.filter(shouldShowPiDiscoveredRecord));
            cursor = result.nextCursor;
        } while (cursor && sessions.length < 5000);

        setPiSessions(sessions);
        setPiSessionsError(errorMessage ?? (cursor ? 'Pi session list truncated at 5000 records. Use search/pagination support before relying on older rows.' : null));
        setIsLoadingPiSessions(false);
    }, [machineId, machine]);

    React.useEffect(() => {
        void refreshPiSessions();
    }, [refreshPiSessions]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await Promise.all([
            sync.refreshMachines(),
            refreshPiSessions(),
        ]);
        setIsRefreshing(false);
    };

    const handleDeleteMachine = async () => {
        if (!machineId) return;
        const confirmed = await Modal.confirm(
            t('machine.deleteConfirmTitle'),
            t('machine.deleteConfirmMessage'),
            { cancelText: t('common.cancel'), confirmText: t('common.delete'), destructive: true }
        );
        if (!confirmed) return;

        setIsDeletingMachine(true);
        try {
            const result = await machineDelete(machineId);
            if (result.success) {
                router.back();
            } else {
                Modal.alert(t('common.error'), result.message || t('machine.deleteFailed'));
            }
        } catch (error) {
            Modal.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('machine.deleteFailed')
            );
        } finally {
            setIsDeletingMachine(false);
        }
    };

    const handleRenameMachine = async () => {
        if (!machine || !machineId) return;

        const newDisplayName = await Modal.prompt(
            t('appWide.renameMachine'),
            t('appWide.giveThisMachineACustomNameLeaveEmptyTo'),
            {
                defaultValue: machine.metadata?.displayName || '',
                placeholder: machine.metadata?.host || t('appWide.enterMachineName'),
                cancelText: t('common.cancel'),
                confirmText: t('common.rename')
            }
        );

        if (newDisplayName !== null) {
            setIsRenamingMachine(true);
            try {
                const updatedMetadata = {
                    ...machine.metadata!,
                    displayName: newDisplayName.trim() || undefined
                };

                await machineUpdateMetadata(
                    machineId,
                    updatedMetadata,
                    machine.metadataVersion
                );

                Modal.alert(t('common.success'), t('appWide.machineRenamedSuccessfully'));
            } catch (error) {
                Modal.alert(
                    t('appWide.error'),
                    error instanceof Error ? error.message : t('appWide.failedToRenameMachine')
                );
                // Refresh to get latest state
                await sync.refreshMachines();
            } finally {
                setIsRenamingMachine(false);
            }
        }
    };

    const handleStartSession = async (approvedNewDirectoryCreation: boolean = false): Promise<void> => {
        if (!machine || !machineId) return;
        try {
            const pathToUse = (customPath.trim() || '~');
            if (!isMachineOnline(machine)) return;
            setIsSpawning(true);
            const absolutePath = resolveAbsolutePath(pathToUse, machine?.metadata?.homeDir);
            const result = await machineSpawnNewSession({
                machineId: machineId!,
                directory: absolutePath,
                approvedNewDirectoryCreation
            });
            switch (result.type) {
                case 'success':
                    // Dismiss machine picker & machine detail screen
                    router.back();
                    router.back();
                    navigateToSession(result.sessionId);
                    break;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm(t('appWide.createDirectory'), t('appWide.theDirectoryValueDoesNotExistWouldYouLike', { value0: result.directory }), { cancelText: t('common.cancel'), confirmText: t('common.create') });
                    if (approved) {
                        await handleStartSession(true);
                    }
                    break;
                }
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            let errorMessage = 'Failed to start session. Make sure the daemon is running on the target machine.';
            if (error instanceof Error && !error.message.includes('Failed to spawn session')) {
                errorMessage = error.message;
            }
            Modal.alert(t('common.error'), errorMessage);
        } finally {
            setIsSpawning(false);
        }
    };

    const handleOpenPiSession = useCallback(async (piSession: PiMachineSessionRecord) => {
        if (!machineId || !machine) return;

        if (piSession.relaySessionId) {
            navigateToSession(piSession.relaySessionId);
            return;
        }

        setIsSpawning(true);
        try {
            // A discovered computer-side Pi session is first attached to its
            // canonical relay identity. Never start a second runtime here.
            const result = await machineEnsurePiSessionMirror({
                machineId,
                piSessionId: piSession.piSessionId,
                directory: piSession.cwd,
            });
            if (result.type === 'success') {
                await sync.refreshSessions();
                router.back();
                navigateToSession(result.sessionId);
            } else {
                Modal.alert(t('common.error'), result.errorMessage);
            }
        } finally {
            setIsSpawning(false);
        }
    }, [machineId, machine, navigateToSession, router]);

    const piSessionTitle = useCallback((piSession: PiMachineSessionRecord) => {
        return piSession.name?.trim() || piSession.firstMessage?.trim() || t('appWide.session');
    }, []);

    const piSessionSubtitle = useCallback((piSession: PiMachineSessionRecord) => {
        const bits = [
            piSession.cwd ? formatPathRelativeToHome(piSession.cwd, machine?.metadata?.homeDir) : undefined,
            `${piSession.messageCount} messages`,
        ];
        return bits.filter(Boolean).join(' • ');
    }, [machine?.metadata?.homeDir]);

    if (!machine) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: '',
                        headerBackTitle: t('machine.back')
                    }}
                />
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={[Typography.default(), { fontSize: 16, color: '#666' }]}>{t('appWide.machineNotFound')}</Text>
                </View>
            </>
        );
    }

    const metadata = machine.metadata;
    const machineName = metadata?.displayName || metadata?.host || 'unknown machine';

    const spawnButtonDisabled = !customPath.trim() || isSpawning || !isMachineOnline(machine!);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: () => (
                        <View style={{ alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons
                                    name="desktop-outline"
                                    size={18}
                                    color={theme.colors.header.tint}
                                    style={{ marginRight: 6 }}
                                />
                                <Text style={[Typography.default('semiBold'), { fontSize: 17, color: theme.colors.header.tint }]}>
                                    {machineName}
                                </Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                <View style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: 3,
                                    backgroundColor: isMachineOnline(machine) ? '#34C759' : '#999',
                                    marginRight: 4
                                }} />
                                <Text style={[Typography.default(), {
                                    fontSize: 12,
                                    color: isMachineOnline(machine) ? '#34C759' : '#999'
                                }]}>
                                    {isMachineOnline(machine) ? t('status.online') : t('status.offline')}
                                </Text>
                            </View>
                        </View>
                    ),
                    headerRight: () => (
                        <Pressable
                            onPress={handleRenameMachine}
                            hitSlop={10}
                            style={{
                                opacity: isRenamingMachine ? 0.5 : 1
                            }}
                            disabled={isRenamingMachine}
                        >
                            <Octicons
                                name="pencil"
                                size={24}
                                color={theme.colors.text}
                            />
                        </Pressable>
                    ),
                    headerBackTitle: t('machine.back')
                }}
            />
            <ItemList
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                    />
                }
                keyboardShouldPersistTaps="handled"
            >
                {/* Launch section */}
                {machine && (
                    <>
                        {!isMachineOnline(machine) && (
                            <ItemGroup>
                                <Item
                                    title={t('machine.offlineUnableToSpawn')}
                                    subtitle={t('machine.offlineHelp')}
                                    subtitleLines={0}
                                    showChevron={false}
                                />
                            </ItemGroup>
                        )}
                        <ItemGroup title={t('machine.launchNewSessionInDirectory')}>
                        <View style={{ opacity: isMachineOnline(machine) ? 1 : 0.5 }}>
                            <View style={styles.pathInputContainer}>
                                <View style={[styles.pathInput, { paddingVertical: 8 }]}>
                                    <MultiTextInput
                                        ref={inputRef}
                                        value={customPath}
                                        onChangeText={setCustomPath}
                                        placeholder={t('appWide.enterCustomPath')}
                                        maxHeight={76}
                                        paddingTop={8}
                                        paddingBottom={8}
                                        paddingRight={48}
                                    />
                                    <Pressable
                                        onPress={() => handleStartSession()}
                                        disabled={spawnButtonDisabled}
                                        style={[
                                            styles.inlineSendButton,
                                            spawnButtonDisabled ? styles.inlineSendInactive : styles.inlineSendActive
                                        ]}
                                    >
                                        <Ionicons
                                            name="play"
                                            size={16}
                                            color={spawnButtonDisabled ? theme.colors.textSecondary : theme.colors.button.primary.tint}
                                            style={{ marginLeft: 1 }}
                                        />
                                    </Pressable>
                                </View>
                            </View>
                            <View style={{ paddingTop: 4 }} />
                            {pathsToShow.map((path, index) => {
                                const display = formatPathRelativeToHome(path, machine.metadata?.homeDir);
                                const isSelected = customPath.trim() === display;
                                const isLast = index === pathsToShow.length - 1;
                                const hideDivider = isLast && pathsToShow.length <= 5;
                                return (
                                    <Item
                                        key={path}
                                        title={display}
                                        leftElement={<Ionicons name="folder-outline" size={18} color={theme.colors.textSecondary} />}
                                        onPress={isMachineOnline(machine) ? () => {
                                            setCustomPath(display);
                                            setTimeout(() => inputRef.current?.focus(), 50);
                                        } : undefined}
                                        disabled={!isMachineOnline(machine)}
                                        selected={isSelected}
                                        showChevron={false}
                                        pressableStyle={isSelected ? { backgroundColor: theme.colors.surfaceSelected } : undefined}
                                        showDivider={!hideDivider}
                                    />
                                );
                            })}
                            {recentPaths.length > 5 && (
                                <Item
                                    title={showAllPaths ? t('machineLauncher.showLess') : t('machineLauncher.showAll', { count: recentPaths.length })}
                                    onPress={() => setShowAllPaths(!showAllPaths)}
                                    showChevron={false}
                                    showDivider={false}
                                    titleStyle={{
                                        textAlign: 'center',
                                        color: (theme as any).dark ? theme.colors.button.primary.tint : theme.colors.button.primary.background
                                    }}
                                />
                            )}
                        </View>
                        </ItemGroup>
                    </>
                )}

                {/* Daemon */}
                <ItemGroup title={t('machine.daemon')}>
                        <Item
                            title={t('machine.status')}
                            detail={t(`status.${daemonStatus}`)}
                            detailStyle={{
                                color: daemonStatus === 'online' ? '#34C759' : '#FF9500'
                            }}
                            showChevron={false}
                        />
                        <Item
                            title={t('machine.stopDaemon')}
                            titleStyle={{
                                color: daemonStatus === 'offline' ? '#999' : '#FF9500'
                            }}
                            onPress={daemonStatus === 'offline' ? undefined : handleStopDaemon}
                            disabled={isStoppingDaemon || daemonStatus === 'offline'}
                            rightElement={
                                isStoppingDaemon ? (
                                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                                ) : (
                                    <Ionicons
                                        name="stop-circle"
                                        size={20}
                                        color={daemonStatus === 'offline' ? '#999' : '#FF9500'}
                                    />
                                )
                            }
                        />
                </ItemGroup>

                {/* CLI Availability */}
                {metadata?.cliAvailability && (
                    <ItemGroup title={t('machine.cliAvailability')}>
                        <Item
                            title="pi"
                            showChevron={false}
                            rightElement={
                                <Text style={{ color: metadata.cliAvailability.pi ? '#34C759' : theme.colors.textSecondary, fontSize: 14 }}>
                                    {metadata.cliAvailability.pi ? t('machine.cliInstalled') : t('machine.cliNotFound')}
                                </Text>
                            }
                        />
                    </ItemGroup>
                )}

                {/* Pi sessions on this machine */}
                <ItemGroup title={t('appWide.piSessionsOnThisMachine')}>
                    {isLoadingPiSessions && piSessions.length === 0 ? (
                        <Item
                            title={t('appWide.scanningLocalPiHistory')}
                            showChevron={false}
                            rightElement={<ActivityIndicator size="small" color={theme.colors.textSecondary} />}
                        />
                    ) : piSessionsError ? (
                        <Item
                            title={t('appWide.unableToScanPiSessions')}
                            subtitle={piSessionsError}
                            subtitleLines={0}
                            showChevron={false}
                        />
                    ) : piSessions.length === 0 ? (
                        <Item
                            title={isMachineOnline(machine) ? t('appWide.noLocalPiSessionsFound') : t('appWide.machineOffline')}
                            subtitle={isMachineOnline(machine) ? t('appWide.startAPiSessionOnThisNodeToCreate') : t('appWide.connectThisNodeToScanLocalPiHistory')}
                            showChevron={false}
                        />
                    ) : (
                        piSessions.slice(0, 12).map((piSession) => (
                            <Item
                                key={piSession.piSessionId}
                                title={piSessionTitle(piSession)}
                                subtitle={piSessionSubtitle(piSession)}
                                subtitleLines={2}
                                onPress={isMachineOnline(machine) ? () => handleOpenPiSession(piSession) : undefined}
                                disabled={!isMachineOnline(machine) || isSpawning}
                                rightElement={piSession.state === 'active_runtime'
                                    ? <Text style={{ color: '#34C759', fontSize: 13 }}>{t('status.online')}</Text>
                                    : <Ionicons name="play" size={18} color={theme.colors.textSecondary} />}
                            />
                        ))
                    )}
                    {piSessions.length > 12 && (
                        <Item
                            title={t('appWide.showing12OfValuePiSessions', { value0: piSessions.length })}
                            showChevron={false}
                            titleStyle={{ textAlign: 'center', color: theme.colors.textSecondary }}
                        />
                    )}
                </ItemGroup>

                {/* Previous Sessions (relay cache) */}
                {previousSessions.length > 0 && (
                    <ItemGroup title={t('sessionHistory.title')}>
                        {previousSessions.map(session => (
                            <Item
                                key={session.id}
                                title={getSessionName(session)}
                                subtitle={getSessionSubtitle(session)}
                                onPress={() => navigateToSession(session.id)}
                                rightElement={<Ionicons name="chevron-forward" size={20} color="#C7C7CC" />}
                            />
                        ))}
                    </ItemGroup>
                )}

                {/* Machine */}
                <ItemGroup title={t('machine.machineGroup')}>
                        <Item
                            title={t('machine.host')}
                            subtitle={metadata?.host || t('status.unknown')}
                        />
                        {metadata?.platform && (
                            <Item
                                title={t('machine.platform')}
                                subtitle={metadata.platform}
                            />
                        )}
                        <Item
                            title={t('machine.lastSeen')}
                            subtitle={machine.activeAt ? new Date(machine.activeAt).toLocaleString() : t('machine.never')}
                        />
                </ItemGroup>

                {/* Danger zone */}
                <ItemGroup title={t('machine.dangerZone')} footer={t('machine.deleteFooter')}>
                    <Item
                        title={t('machine.delete')}
                        titleStyle={{ color: '#FF3B30' }}
                        onPress={handleDeleteMachine}
                        disabled={isDeletingMachine}
                        showChevron={false}
                        rightElement={
                            isDeletingMachine ? (
                                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                            ) : (
                                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                            )
                        }
                    />
                </ItemGroup>
            </ItemList>
        </>
    );
}
