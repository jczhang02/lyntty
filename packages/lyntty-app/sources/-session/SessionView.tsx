import { AgentContentView } from '@/components/AgentContentView';
import { AgentInput } from '@/components/AgentInput';
import type { MultiTextInputHandle } from '@/components/MultiTextInput';
import { layout } from '@/components/layout';
import { getSuggestions } from '@/components/autocomplete/suggestions';
import { ChatHeaderView } from '@/components/ChatHeaderView';
import { ChatList } from '@/components/ChatList';
import { Deferred } from '@/components/Deferred';
import { EmptyMessages } from '@/components/EmptyMessages';
import { Avatar } from '@/components/Avatar';
import { useDraft } from '@/hooks/useDraft';
import { useImagePicker } from '@/hooks/useImagePicker';
import { Modal } from '@/modal';
import { apiSocket } from '@/sync/apiSocket';
import { gitStatusSync } from '@/sync/gitStatusSync';
import { storage, useIsDataReady, useLocalSetting, useMachine, useSessionMessages, useSessionUsage, useSetting } from '@/sync/storage';
import { useSession } from '@/sync/storage';
import { Session } from '@/sync/storageTypes';
import { canControlSession } from '@/sync/sessionControlPolicy';
import { sync } from '@/sync/sync';
import { t } from '@/text';
import { isRunningOnMac } from '@/utils/platform';
import { useDeviceType, useHeaderHeight, useIsLandscape, useIsTablet } from '@/utils/responsive';
import { FilesSidebar, SidebarMode } from '@/components/FilesSidebar';
import { AllFilesDiffView } from '@/components/AllFilesDiffView';
import { FileViewPanel } from '@/components/FileViewPanel';
import { prefetchPierreDiff } from '@/components/diff/PierreDiffView';
import { GitFileStatus } from '@/sync/gitStatusFiles';
import { useOverlayNav } from '@/-session/sessionOverlayNav';
import { formatPathRelativeToHome, getSessionAvatarId, getSessionName, shouldShowPiHistoryLoading, useSessionStatus } from '@/utils/sessionUtils';
import { useSessionQuickActions } from '@/hooks/useSessionQuickActions';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUnistyles } from 'react-native-unistyles';
import { abortSessionFromMobile } from './sessionAbortAction';
import { useFocusEffect } from '@react-navigation/native';

export const SessionView = React.memo((props: { id: string }) => {
    const sessionId = props.id;
    const router = useRouter();
    const session = useSession(sessionId);
    const isDataReady = useIsDataReady();
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const headerHeight = useHeaderHeight();
    const isTablet = useIsTablet();
    const { width: windowWidth } = useWindowDimensions();
    const fileDiffsSidebarEnabled = useSetting('fileDiffsSidebar');
    const zenMode = useLocalSetting('zenMode');

    useFocusEffect(
        React.useCallback(() => {
            apiSocket.setVisibleSessionId(sessionId);
            return () => apiSocket.clearVisibleSessionId(sessionId);
        }, [sessionId])
    );

    // Base condition: can we show the diff sidebar at all?
    const canShowSidebar = fileDiffsSidebarEnabled
        && isRunningOnMac()
        && windowWidth >= SIDEBAR_MIN_WINDOW_WIDTH
        && isDataReady && !!session;

    const showSidebar = canShowSidebar && !zenMode;

    // Match left sidebar width: 30% of window, clamped to 250–360px
    const sidebarWidth = Math.min(Math.max(Math.floor(windowWidth * 0.3), 250), 360);

    // Animate the Mac Catalyst diff sidebar width on Reanimated's UI thread.
    const sidebarAnim = useSharedValue(showSidebar ? 1 : 0);
    React.useEffect(() => {
        sidebarAnim.value = withTiming(showSidebar ? 1 : 0, {
            duration: 250,
            easing: Easing.out(Easing.cubic),
        });
    }, [showSidebar]);
    const animatedSidebarStyle = useAnimatedStyle(() => ({
        width: sidebarAnim.value * sidebarWidth,
        opacity: sidebarAnim.value,
        overflow: 'hidden' as const,
    }));

    const [sidebarMode, setSidebarMode] = React.useState<SidebarMode>('changes');

    // Overlay state is managed as a history stack so the
    // sidebar's back / forward arrows can navigate between chat ↔ diff ↔ file
    // without a per-overlay close button. Stack + cursor live in one piece
    // of state so functional updates stay coordinated.
    type OverlayEntry =
        | { kind: 'none' }
        | { kind: 'diff'; file: string }
        | { kind: 'file'; path: string };
    const [overlayHistory, setOverlayHistory] = React.useState<{ stack: OverlayEntry[]; cursor: number }>(
        { stack: [{ kind: 'none' }], cursor: 0 }
    );
    const overlayCurrent = overlayHistory.stack[overlayHistory.cursor] ?? { kind: 'none' };
    const diffViewOpen = overlayCurrent.kind === 'diff';
    const fileViewPath = overlayCurrent.kind === 'file' ? overlayCurrent.path : null;
    const scrollToFile = overlayCurrent.kind === 'diff' ? overlayCurrent.file : null;

    const pushOverlay = React.useCallback((entry: OverlayEntry) => {
        setOverlayHistory((prev) => {
            const truncated = prev.stack.slice(0, prev.cursor + 1);
            truncated.push(entry);
            return { stack: truncated, cursor: truncated.length - 1 };
        });
    }, []);

    const handleSidebarFilePress = React.useCallback((file: GitFileStatus) => {
        if (file.status === 'deleted') return;
        pushOverlay({ kind: 'diff', file: file.fullPath });
    }, [pushOverlay]);
    const handleAllFilesFilePress = React.useCallback((filePath: string) => {
        pushOverlay({ kind: 'file', path: filePath });
    }, [pushOverlay]);

    // When sidebar capability is lost (screen too narrow, disabled), close views.
    // Don't close on zen mode toggle — keep the view visible.
    React.useEffect(() => {
        if (!canShowSidebar) {
            setOverlayHistory({ stack: [{ kind: 'none' }], cursor: 0 });
        }
    }, [canShowSidebar]);

    // Right-side header content published by the active overlay (diff toggle / save button).
    const [headerRightSlot, setHeaderRightSlot] = React.useState<React.ReactNode>(null);

    // Wire intra-session back / forward into the global SidebarNavigator arrows.
    const canOverlayBack = overlayHistory.cursor > 0;
    const canOverlayForward = overlayHistory.cursor < overlayHistory.stack.length - 1;
    React.useEffect(() => {
        useOverlayNav.getState().publish({
            canBack: canOverlayBack,
            canForward: canOverlayForward,
            back: () => {
                if (!canOverlayBack) return false;
                setOverlayHistory((prev) => (
                    prev.cursor <= 0 ? prev : { ...prev, cursor: prev.cursor - 1 }
                ));
                return true;
            },
            forward: () => {
                if (!canOverlayForward) return false;
                setOverlayHistory((prev) => (
                    prev.cursor >= prev.stack.length - 1 ? prev : { ...prev, cursor: prev.cursor + 1 }
                ));
                return true;
            },
        });
        return () => useOverlayNav.getState().reset();
    }, [canOverlayBack, canOverlayForward]);

    // Warm the lazy diff renderer while the user is still reading chat.
    React.useEffect(() => {
        prefetchPierreDiff();
    }, []);

    // Compute header props based on session state
    const headerProps = useMemo(() => {
        if (!isDataReady) {
            return { title: '', folderName: undefined, isConnected: false };
        }
        if (!session) {
            return { title: t('errors.sessionDeleted'), folderName: undefined, isConnected: false };
        }
        const isConnected = session.presence === 'online';
        const pathSegments = session.metadata?.path?.split(/[/\\]/).filter(Boolean);
        const folderName = pathSegments?.[pathSegments.length - 1];
        const sessionName = getSessionName(session);
        return {
            title: sessionName,
            folderName,
            isConnected,
        };
    }, [session, isDataReady]);
    const headerRight = session && deviceType === 'phone'
        ? (
            <Pressable
                onPress={() => router.push(`/session/${sessionId}/info`)}
                hitSlop={10}
            >
                <Avatar
                    id={getSessionAvatarId(session)}
                    size={28}
                    monochrome={!headerProps.isConnected}
                    flavor={session.metadata?.flavor}
                />
            </Pressable>
        )
        : null;

    const mainContent = (
        <>
            {/* Status bar shadow for landscape mode */}
            {isLandscape && deviceType === 'phone' && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: safeArea.top,
                    backgroundColor: theme.colors.surface,
                    zIndex: 1000,
                    shadowColor: theme.colors.shadow.color,
                    shadowOffset: {
                        width: 0,
                        height: 2,
                    },
                    shadowOpacity: theme.colors.shadow.opacity,
                    shadowRadius: 3,
                    elevation: 5,
                }} />
            )}

            {/* Header is hidden in landscape mode on phones. */}
            {!(isLandscape && deviceType === 'phone') && (
                <View style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1000
                }}>
                    <ChatHeaderView
                        title={headerProps.title}
                        folderName={headerProps.folderName}
                        isConnected={headerProps.isConnected}
                        extraPathSegment={fileViewPath ?? undefined}
                        rightSlot={(diffViewOpen || !!fileViewPath) ? headerRightSlot : headerRight}
                        onTitlePress={session ? () => router.push(`/session/${sessionId}/info`) : undefined}
                        onBackPress={() => router.back()}
                    />
                </View>
            )}

            {/* Content based on state */}
            <View style={{ flex: 1, paddingTop: !(isLandscape && deviceType === 'phone') ? safeArea.top + headerHeight : 0 }}>
                {!isDataReady ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : !session ? (
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                        <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, fontWeight: '600' }}>{t('errors.sessionDeleted')}</Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32 }}>{t('errors.sessionDeletedDescription')}</Text>
                    </View>
                ) : (
                    <SessionViewLoaded key={sessionId} sessionId={sessionId} session={session} />
                )}
            </View>
        </>
    );

    if (!canShowSidebar) {
        return mainContent;
    }

    // Desktop layout: chat + animated sidebar at the same level (full height).
    // When a sidebar file is selected, InlineFileDiff overlays the main content
    // (chat stays mounted underneath so state is preserved).
    return (
        <View style={{ flex: 1, flexDirection: 'row' }}>
            <View
                style={{ flex: 1 }}
            >
                {mainContent}
                {diffViewOpen && canShowSidebar && (
                    <View
                        pointerEvents="box-none"
                        style={{
                            position: 'absolute',
                            top: safeArea.top + headerHeight,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: theme.colors.surface,
                        }}
                    >
                        <AllFilesDiffView
                            sessionId={sessionId}
                            scrollToFile={scrollToFile}
                            onHeaderRightSlotChange={setHeaderRightSlot}
                        />
                    </View>
                )}
                {fileViewPath && canShowSidebar && (
                    <View
                        pointerEvents="box-none"
                        style={{
                            position: 'absolute',
                            top: safeArea.top + headerHeight,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: theme.colors.surface,
                        }}
                    >
                        <FileViewPanel
                            sessionId={sessionId}
                            filePath={fileViewPath}
                            onHeaderRightSlotChange={setHeaderRightSlot}
                        />
                    </View>
                )}
            </View>
            <Animated.View style={[{ minWidth: 0, alignSelf: 'stretch' }, animatedSidebarStyle]}>
                <View style={{ width: sidebarWidth, flex: 1 }}>
                    <FilesSidebar
                        sessionId={sessionId}
                        selectedPath={sidebarMode === 'changes' ? scrollToFile : fileViewPath}
                        onFilePress={handleSidebarFilePress}
                        mode={sidebarMode}
                        onModeChange={setSidebarMode}
                        onAllFilesFilePress={handleAllFilesFilePress}
                    />
                </View>
            </Animated.View>
        </View>
    );
});

const SIDEBAR_MIN_WINDOW_WIDTH = 1100;

// Hoisted so AgentInput's React.memo doesn't see a new array ref on every keystroke
const AGENT_INPUT_AUTOCOMPLETE_PREFIXES = ['@', '/'];

// Imperative handle exposed by ChatComposer so SessionViewLoaded can read /
// clear the message text without subscribing to it (which would re-render
// the whole loaded screen on every keystroke).
type ChatComposerHandle = {
    getMessage: () => string;
    clearMessageIfUnchanged: (expected: string) => void;
};

type ChatComposerProps = Omit<
    React.ComponentProps<typeof AgentInput>,
    'initialValue' | 'onChangeText'
> & {
    sessionId: string;
    composerHandleRef: React.RefObject<ChatComposerHandle | null>;
};

// Owns the chat-message draft autosave. The textarea itself is uncontrolled:
// keystrokes never round-trip through React state, so the parent can stay
// stable on every keystroke and deletion doesn't batch on a busy main thread.
// `message` here is a low-priority mirror updated via startTransition; it's
// only used to feed useDraft's debounced autosave. Reads/clears on send go
// through the MultiTextInput handle imperatively.
const ChatComposer = React.memo(function ChatComposer(props: ChatComposerProps) {
    const { sessionId, composerHandleRef, ...rest } = props;
    // Synchronously hydrate the textarea with any saved draft so the user sees
    // their work-in-progress on session open without an extra round-trip.
    const initialDraft = React.useMemo(() => {
        return storage.getState().sessions[sessionId]?.draft ?? '';
    }, [sessionId]);
    const inputHandleRef = React.useRef<MultiTextInputHandle>(null);
    const [message, setMessage] = React.useState(initialDraft);

    const applyDraft = React.useCallback((text: string) => {
        inputHandleRef.current?.setTextAndSelection(text, { start: text.length, end: text.length });
        setMessage(text);
    }, []);

    const { clearDraft } = useDraft(sessionId, message, applyDraft);

    const handleChangeText = React.useCallback((text: string) => {
        // Transition keeps the textarea responsive even when the draft
        // autosave / re-render takes longer than a frame.
        React.startTransition(() => setMessage(text));
    }, []);

    React.useImperativeHandle(composerHandleRef, () => ({
        getMessage: () => inputHandleRef.current?.getText() ?? '',
        clearMessageIfUnchanged: (expected: string) => {
            if ((inputHandleRef.current?.getText() ?? '') !== expected) return;
            inputHandleRef.current?.setTextAndSelection('', { start: 0, end: 0 });
            setMessage('');
            clearDraft();
        },
    }), [clearDraft]);

    return (
        <AgentInput
            {...rest}
            ref={inputHandleRef}
            sessionId={sessionId}
            initialValue={initialDraft}
            onChangeText={handleChangeText}
        />
    );
});

function SessionViewLoaded({ sessionId, session }: { sessionId: string, session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const safeArea = useSafeAreaInsets();
    const isLandscape = useIsLandscape();
    const deviceType = useDeviceType();
    const isTablet = useIsTablet();
    const { messages, isLoaded } = useSessionMessages(sessionId);
    const acknowledgedCliVersions = useLocalSetting('acknowledgedCliVersions');
    const zenMode = useLocalSetting('zenMode');
    const sessionInputHorizontalPadding = isRunningOnMac() || isTablet ? 12 : 8;

    // Check if CLI version is outdated and not already acknowledged
    const cliVersion = session.metadata?.version;
    const machineId = session.metadata?.machineId;
    const isCliOutdated = cliVersion && !isVersionSupported(cliVersion, MINIMUM_CLI_VERSION);
    const isAcknowledged = machineId && acknowledgedCliVersions[machineId] === cliVersion;
    const shouldShowCliWarning = isCliOutdated && !isAcknowledged;
    const sessionIsControllable = canControlSession(session.metadata);

    const sessionStatus = useSessionStatus(session);
    const machine = useMachine(session.metadata?.machineId ?? '');
    const sessionUsage = useSessionUsage(sessionId);
    const alwaysShowContextSize = useSetting('alwaysShowContextSize');
    const experiments = useSetting('experiments');
    const { canResume, resumeSession, resumingSession } = useSessionQuickActions(session);
    const isDisconnected = !sessionStatus.isConnected;

    const { selectedImages, pickImages, removeImage, clearImages } = useImagePicker();

    // ChatComposer owns the message state + useDraft subscription. We only
    // hold an imperative handle so handleSend can read the live text and
    // clear it without subscribing to it (which would re-render the whole
    // SessionViewLoaded tree on every keystroke).
    const composerHandleRef = React.useRef<ChatComposerHandle | null>(null);
    const sendInFlightRef = React.useRef(false);

    // Handle dismissing CLI version warning
    const handleDismissCliWarning = React.useCallback(() => {
        if (machineId && cliVersion) {
            storage.getState().applyLocalSettings({
                acknowledgedCliVersions: {
                    ...acknowledgedCliVersions,
                    [machineId]: cliVersion
                }
            });
        }
    }, [machineId, cliVersion, acknowledgedCliVersions]);

    // Memoize header-dependent styles to prevent re-renders
    const headerDependentStyles = React.useMemo(() => ({
        contentContainer: {
            flex: 1
        },
        flatListStyle: {
            marginTop: 0 // No marginTop needed since header is handled by parent
        },
    }), []);

    // handleSend reads the live message via the composer ref, so it doesn't
    // need to re-create on every keystroke.
    const handleSend = React.useCallback(() => {
        if (sendInFlightRef.current) return;
        const liveMessage = composerHandleRef.current?.getMessage() ?? '';
        if (!liveMessage.trim() && selectedImages.length === 0) return;
        const attachments = selectedImages;
        sendInFlightRef.current = true;
        void sync.sendMessage(sessionId, liveMessage, { source: 'chat', attachments }).then((queued) => {
            if (!queued) return;
            composerHandleRef.current?.clearMessageIfUnchanged(liveMessage);
            clearImages();
        }).catch(() => {
            Modal.alert(t('common.error'), t('appWide.messageFailed'));
        }).finally(() => {
            sendInFlightRef.current = false;
        });
    }, [sessionId, selectedImages, clearImages]);

    const handleAbort = React.useCallback(async () => {
        storage.getState().resetSessionAgentOverrides(sessionId);
        await abortSessionFromMobile(sessionId, session.metadata);
    }, [sessionId, session.metadata]);

    const handleFileViewerPress = React.useCallback(() => {
        router.push(`/session/${sessionId}/files`);
    }, [router, sessionId]);

    const handleAutocompleteSuggestions = React.useCallback((query: string) => (
        getSuggestions(sessionId, query)
    ), [sessionId]);

    const connectionStatus = React.useMemo(() => ({
        text: sessionStatus.statusText,
        color: sessionStatus.statusColor,
        dotColor: sessionStatus.statusDotColor,
        isPulsing: sessionStatus.isPulsing,
    }), [sessionStatus.statusText, sessionStatus.statusColor, sessionStatus.statusDotColor, sessionStatus.isPulsing]);

    const usageData = React.useMemo(() => {
        const source = sessionUsage ?? session.latestUsage;
        if (!source) return undefined;
        return {
            inputTokens: source.inputTokens,
            outputTokens: source.outputTokens,
            cacheCreation: source.cacheCreation,
            cacheRead: source.cacheRead,
            contextSize: source.contextSize,
        };
    }, [sessionUsage, session.latestUsage]);

    // Trigger session visibility and initialize git status sync
    React.useLayoutEffect(() => {

        // Trigger session sync
        sync.onSessionVisible(sessionId);

        // Mark session as currently being viewed (clears unread)
        storage.getState().setCurrentViewingSession(sessionId);

        if (sessionIsControllable) {
            gitStatusSync.getSync(sessionId);
        }

        return () => {
            gitStatusSync.stop(sessionId);
            const current = storage.getState().currentViewingSessionId;
            if (current === sessionId) {
                storage.getState().setCurrentViewingSession(null);
            }
        };
    }, [sessionId, sessionIsControllable]);

    const showPiHistoryLoading = shouldShowPiHistoryLoading(session, messages.length);

    let content = (
        <>
            <Deferred>
                {messages.length > 0 && (
                    <ChatList session={session} />
                )}
            </Deferred>
        </>
    );
    const placeholder = messages.length === 0 ? (
        <>
            {showPiHistoryLoading ? (
                <View style={{ alignItems: 'center', gap: 10 }}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>
                        {t('session.loadingLatestMessages')}
                    </Text>
                </View>
            ) : isLoaded ? (
                <EmptyMessages session={session} />
            ) : (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            )}
        </>
    ) : null;

    const composer = sessionIsControllable ? (
        <ChatComposer
            composerHandleRef={composerHandleRef}
            placeholder={t('session.inputPlaceholder')}
            sessionId={sessionId}
            connectionStatus={connectionStatus}
            blockSend={false}
            onSend={handleSend}
            onAbort={isDisconnected ? undefined : handleAbort}
            showAbortButton={sessionStatus.state === 'thinking' || sessionStatus.state === 'waiting'}
            onFileViewerPress={experiments && !isTablet ? handleFileViewerPress : undefined}
            selectedImages={selectedImages}
            onPickImages={pickImages}
            onRemoveImage={removeImage}
            autocompletePrefixes={AGENT_INPUT_AUTOCOMPLETE_PREFIXES}
            autocompleteSuggestions={handleAutocompleteSuggestions}
            usageData={usageData}
            alwaysShowContextSize={alwaysShowContextSize}
            zenMode={zenMode}
        />
    ) : null;

    const waitingForExtension = session.metadata?.controlState === 'waiting_extension';
    const shouldShowInactiveHint = !sessionIsControllable || (isDisconnected && !showPiHistoryLoading);
    const showInstallExtensionHelp = waitingForExtension && sessionIsControllable;
    const showInstallExtensionInstructions = React.useCallback(() => {
        Modal.alert(
            t('session.installPiExtension'),
            t('session.installPiExtensionInstructions'),
            [{ text: t('common.ok'), style: 'cancel' }],
        );
    }, []);

    // Disconnected Pi sessions resume only through lynttyd's activation path.
    const inactiveHint = shouldShowInactiveHint ? (
        <CenteredInputWidth horizontalPadding={sessionInputHorizontalPadding}>
            <InactiveArchivedHint
                hintText={resolveInactiveSessionHint(session, machine ? machine.active === true : null)}
                canResume={sessionIsControllable && canResume}
                resuming={resumingSession}
                actionLabel={waitingForExtension ? t('common.retry') : t('sessionInfo.resumeSession')}
                onResume={resumeSession}
                canInstallExtension={showInstallExtensionHelp}
                onInstallExtension={showInstallExtensionInstructions}
            />
        </CenteredInputWidth>
    ) : null;

    const input = (
        <>
            {inactiveHint}
            {composer}
        </>
    );


    return (
        <>
            {/* CLI Version Warning Overlay - Subtle centered pill */}
            {shouldShowCliWarning && !(isLandscape && deviceType === 'phone') && (
                <Pressable
                    onPress={handleDismissCliWarning}
                    style={{
                        position: 'absolute',
                        top: 8, // Position at top of content area (padding handled by parent)
                        alignSelf: 'center',
                        backgroundColor: '#FFF3CD',
                        borderRadius: 100, // Fully rounded pill
                        paddingHorizontal: 14,
                        paddingVertical: 7,
                        flexDirection: 'row',
                        alignItems: 'center',
                        zIndex: 998, // Below voice bar but above content
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.15,
                        shadowRadius: 4,
                        elevation: 4,
                    }}
                >
                    <Ionicons name="warning-outline" size={14} color="#FF9500" style={{ marginRight: 6 }} />
                    <Text style={{
                        fontSize: 12,
                        color: '#856404',
                        fontWeight: '600'
                    }}>
                        {t('sessionInfo.cliVersionOutdated')}
                    </Text>
                    <Ionicons name="close" size={14} color="#856404" style={{ marginLeft: 8 }} />
                </Pressable>
            )}

            {/* Main content area - no padding since header is overlay */}
            <View style={{ flexBasis: 0, flexGrow: 1, paddingBottom: safeArea.bottom + (isRunningOnMac() ? 8 : 0) }}>
                <AgentContentView
                    content={content}
                    input={input}
                    placeholder={placeholder}
                />
            </View >

            {/* Back button for landscape phone mode when header is hidden */}
            {
                isLandscape && deviceType === 'phone' && (
                    <Pressable
                        onPress={() => router.back()}
                        style={{
                            position: 'absolute',
                            top: safeArea.top + 8,
                            left: 16,
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: `rgba(${theme.dark ? '28, 23, 28' : '255, 255, 255'}, 0.9)`,
                            alignItems: 'center',
                            justifyContent: 'center',
                            ...Platform.select({
                                ios: {
                                    shadowColor: '#000',
                                    shadowOffset: { width: 0, height: 2 },
                                    shadowOpacity: 0.1,
                                    shadowRadius: 4,
                                },
                                android: {
                                    elevation: 2,
                                }
                            }),
                        }}
                        hitSlop={15}
                    >
                        <Ionicons
                            name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                            size={Platform.select({ ios: 28, default: 24 })}
                            color="#000"
                        />
                    </Pressable>
                )
            }
        </>
    )
}

function resolveInactiveSessionHint(session: Session, machineOnline: boolean | null): string {
    const metadata = session.metadata;
    if (!canControlSession(metadata)) {
        return t('session.legacyHistoryOnly');
    }
    if (metadata?.lifecycleState === 'archived' || metadata?.archivedBy) {
        return t('session.inactiveArchived');
    }
    if (metadata?.flavor === 'pi' && metadata.piSessionId) {
        if (machineOnline === false) {
            return t('session.computerOffline');
        }
        if (metadata.controlState === 'waiting_extension') {
            return t('session.waitingForPiExtension');
        }
        return t('session.historyOnly');
    }
    return t('session.inactiveArchived');
}

function InactiveArchivedHint(props: {
    hintText: string;
    canResume: boolean;
    resuming: boolean;
    actionLabel: string;
    onResume: () => void;
    canInstallExtension: boolean;
    onInstallExtension: () => void;
}) {
    const { theme } = useUnistyles();
    const hintTextStyle = {
        color: theme.colors.agentEventText,
        fontSize: 13,
        lineHeight: 18,
        textAlign: 'left' as const,
    };

    return (
        <View style={{
            paddingTop: 12,
            paddingBottom: 10,
            gap: 10,
            alignItems: 'stretch',
        }}>
            <View style={{ paddingHorizontal: 8, gap: 4 }}>
                <Text style={hintTextStyle}>
                    {props.hintText}
                </Text>
            </View>
            {props.canResume ? (
                <Pressable
                    onPress={props.onResume}
                    disabled={props.resuming}
                    style={({ pressed }) => ({
                        height: 40,
                        borderRadius: 10,
                        backgroundColor: theme.colors.button.primary.background,
                        opacity: props.resuming ? 0.6 : pressed ? 0.8 : 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginHorizontal: 8,
                    })}
                >
                    {props.resuming ? (
                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                    ) : (
                        <Text style={{ color: theme.colors.button.primary.tint, fontSize: 15, fontWeight: '600' }}>
                            {props.actionLabel}
                        </Text>
                    )}
                </Pressable>
            ) : null}
            {props.canInstallExtension ? (
                <Pressable
                    onPress={props.onInstallExtension}
                    style={({ pressed }) => ({
                        height: 40,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: theme.colors.divider,
                        opacity: pressed ? 0.7 : 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginHorizontal: 8,
                    })}
                >
                    <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600' }}>
                        {t('session.installPiExtension')}
                    </Text>
                </Pressable>
            ) : null}
        </View>
    );
}

function CenteredInputWidth(props: {
    children: React.ReactNode;
    horizontalPadding: number;
}) {
    return (
        <View style={{
            width: '100%',
            paddingHorizontal: props.horizontalPadding,
            alignItems: 'center',
        }}>
            <View style={{
                width: '100%',
                maxWidth: layout.maxWidth,
            }}>
                {props.children}
            </View>
        </View>
    );
}
