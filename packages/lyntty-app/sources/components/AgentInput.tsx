import { Ionicons, Octicons } from '@expo/vector-icons';
import * as React from 'react';
import { View, Platform, useWindowDimensions, ViewStyle, Text, ActivityIndicator, Pressable } from 'react-native';
import { AgentInputAttachmentStrip } from './AgentInputAttachmentStrip';
import type { AttachmentPreview } from '@/sync/attachmentTypes';
import { layout } from './layout';
import { MultiTextInput, KeyPressEvent } from './MultiTextInput';
import { Typography } from '@/constants/Typography';
import { hapticsLight, hapticsError } from './haptics';
import { Shaker, ShakeInstance } from './Shaker';
import { StatusDot } from './StatusDot';
import { useActiveWord } from './autocomplete/useActiveWord';
import { useActiveSuggestions } from './autocomplete/useActiveSuggestions';
import { AgentInputAutocomplete } from './AgentInputAutocomplete';
import { TextInputState, MultiTextInputHandle } from './MultiTextInput';
import { applySuggestion } from './autocomplete/applySuggestion';
import { GitStatusBadge, useHasMeaningfulGitStatus } from './GitStatusBadge';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Theme } from '@/theme';
import { t } from '@/text';
import { shouldShowAbortControl } from './agentInputControls';

interface AgentInputProps {
    // `initialValue` seeds the uncontrolled textarea once; keystrokes never
    // round-trip back into it via React, which is what keeps fast typing/
    // deletion crisp. The parent reads the live text via the imperative ref.
    initialValue: string;
    placeholder: string;
    // Fires on every keystroke so the parent can sync derived state (drafts,
    // hasText) — typically wrapped in startTransition / debounce by the caller.
    onChangeText?: (text: string) => void;
    sessionId?: string;
    onSend: () => void;
    sendIcon?: React.ReactNode;
    onAbort?: () => void | Promise<void>;
    showAbortButton?: boolean;
    connectionStatus?: {
        text: string;
        color: string;
        dotColor: string;
        isPulsing?: boolean;
    };
    autocompletePrefixes: string[];
    autocompleteSuggestions: (query: string) => Promise<{ key: string, text: string, component: React.ElementType }[]>;
    usageData?: {
        inputTokens: number;
        outputTokens: number;
        cacheCreation: number;
        cacheRead: number;
        contextSize: number;
    };
    alwaysShowContextSize?: boolean;
    onFileViewerPress?: () => void;
    agentType?: 'pi';
    onAgentClick?: () => void;
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
    blockSend?: boolean;
    isSendDisabled?: boolean;
    isSending?: boolean;
    minHeight?: number;
    zenMode?: boolean;
    /** Image attachments waiting to be sent to Pi. */
    selectedImages?: AttachmentPreview[];
    onPickImages?: () => void;
    onRemoveImage?: (id: string) => void;
}

const MAX_CONTEXT_SIZE = 190000;

const stylesheet = StyleSheet.create((theme, runtime) => ({
    container: {
        alignItems: 'center',
        paddingBottom: 8,
        paddingTop: 8,
    },
    innerContainer: {
        width: '100%',
        position: 'relative',
    },
    unifiedPanel: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'hidden',
        paddingVertical: 2,
        paddingBottom: 8,
        paddingHorizontal: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 0,
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 4,
        minHeight: 40,
    },

    // Overlay styles
    autocompleteOverlay: {
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        zIndex: 1000,
    },
    // Button styles
    actionButtonsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 0,
    },
    actionButtonsLeft: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
        overflow: 'hidden',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingHorizontal: 8,
        paddingVertical: 6,
        justifyContent: 'center',
        height: 32,
    },
    actionButtonPressed: {
        opacity: 0.7,
    },
    actionButtonIcon: {
        color: theme.colors.button.secondary.tint,
    },
    sendButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
        marginLeft: 8,
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    sendButtonLocked: {
        backgroundColor: theme.colors.surfaceHigh,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    sendButtonInner: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonInnerPressed: {
        opacity: 0.7,
    },
    sendButtonIcon: {
        color: theme.colors.button.primary.tint,
    },
}));

const getContextWarning = (contextSize: number, alwaysShow: boolean = false, theme: Theme) => {
    const percentageUsed = (contextSize / MAX_CONTEXT_SIZE) * 100;
    const percentageRemaining = Math.max(0, Math.min(100, 100 - percentageUsed));

    if (percentageRemaining <= 5) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warningCritical };
    } else if (percentageRemaining <= 10) {
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warning };
    } else if (alwaysShow) {
        // Show context remaining in neutral color when not near limit
        return { text: t('agentInput.context.remaining', { percent: Math.round(percentageRemaining) }), color: theme.colors.warning };
    }
    return null; // No display needed
};

// Stable sub-trees extracted from AgentInput so they don't reconcile when
// the input's keystroke-derived state (hasText / inputState) flips. Their
// props are derived from session metadata, not from the textarea content,
// so memo skips re-render on typing entirely.

type StatusRowProps = {
    connectionStatus?: AgentInputProps['connectionStatus'];
    contextWarning: { text: string; color: string } | null;
};

const AgentInputStatusRow = React.memo(function AgentInputStatusRow(p: StatusRowProps) {
    if (!p.connectionStatus && !p.contextWarning) {
        return null;
    }
    return (
        <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingBottom: 4,
            minHeight: 20,
        }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 11 }}>
                {p.connectionStatus && (
                    <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <StatusDot
                                color={p.connectionStatus.dotColor}
                                isPulsing={p.connectionStatus.isPulsing}
                                size={6}
                            />
                            <Text style={{
                                fontSize: 11,
                                color: p.connectionStatus.color,
                                ...Typography.default()
                            }}>
                                {p.connectionStatus.text}
                            </Text>
                        </View>
                    </>
                )}
                {p.contextWarning && (
                    <Text style={{
                        fontSize: 11,
                        color: p.contextWarning.color,
                        marginLeft: p.connectionStatus ? 8 : 0,
                        ...Typography.default()
                    }}>
                        {p.connectionStatus ? '• ' : ''}{p.contextWarning.text}
                    </Text>
                )}
            </View>

        </View>
    );
});

type ContextChipsProps = {
    machineName?: string | null;
    onMachineClick?: () => void;
    currentPath?: string | null;
    onPathClick?: () => void;
};

const AgentInputContextChips = React.memo(function AgentInputContextChips(p: ContextChipsProps) {
    const { theme } = useUnistyles();
    if (p.machineName === undefined && !p.currentPath) {
        return null;
    }
    return (
        <View style={{
            backgroundColor: theme.colors.surfacePressed,
            borderRadius: 12,
            padding: 8,
            marginBottom: 8,
            gap: 4,
        }}>
            {p.machineName !== undefined && p.onMachineClick && (
                <Pressable
                    onPress={() => {
                        hapticsLight();
                        p.onMachineClick?.();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={(s) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: Platform.select({ default: 16, android: 20 }),
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        height: 32,
                        opacity: s.pressed ? 0.7 : 1,
                        gap: 6,
                    })}
                >
                    <Ionicons name="desktop-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.text,
                        fontWeight: '600',
                        ...Typography.default('semiBold'),
                    }}>
                        {p.machineName === null ? t('agentInput.noMachinesAvailable') : p.machineName}
                    </Text>
                </Pressable>
            )}
            {p.currentPath && p.onPathClick && (
                <Pressable
                    onPress={() => {
                        hapticsLight();
                        p.onPathClick?.();
                    }}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={(s) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderRadius: Platform.select({ default: 16, android: 20 }),
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        height: 32,
                        opacity: s.pressed ? 0.7 : 1,
                        gap: 6,
                    })}
                >
                    <Ionicons name="folder-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={{
                        fontSize: 13,
                        color: theme.colors.text,
                        fontWeight: '600',
                        ...Typography.default('semiBold'),
                    }}>
                        {p.currentPath}
                    </Text>
                </Pressable>
            )}
        </View>
    );
});

export const AgentInput = React.memo(React.forwardRef<MultiTextInputHandle, AgentInputProps>((props, ref) => {
    const styles = stylesheet;
    const { theme } = useUnistyles();
    const screenWidth = useWindowDimensions().width;
    const isSendBlocked = props.blockSend ?? false;

    // `hasText` drives only the send-button appearance/enabled state. It's
    // updated via startTransition from the keystroke handler so a busy reducer
    // never blocks the next character from landing in the textarea.
    const [hasText, setHasText] = React.useState(() => props.initialValue.trim().length > 0);
    const hasImages = (props.selectedImages?.length ?? 0) > 0;
    const canPressSendButton = !props.isSending
        && !props.isSendDisabled
        && (hasText || hasImages);

    const showAbortControl = shouldShowAbortControl(props.showAbortButton, !!props.onAbort);

    // Calculate context warning
    const contextWarning = props.usageData?.contextSize
        ? getContextWarning(props.usageData.contextSize, props.alwaysShowContextSize ?? false, theme)
        : null;

    // Abort button state
    const [isAborting, setIsAborting] = React.useState(false);
    const shakerRef = React.useRef<ShakeInstance>(null);
    const sendBlockShakerRef = React.useRef<ShakeInstance>(null);
    const inputRef = React.useRef<MultiTextInputHandle>(null);

    // Forward ref to the MultiTextInput
    React.useImperativeHandle(ref, () => inputRef.current!, []);

    // Autocomplete state — text + selection. Updated via startTransition so
    // typing renders the character immediately and the autocomplete pipeline
    // catches up on the next idle frame instead of blocking input.
    const [inputState, setInputState] = React.useState<TextInputState>(() => ({
        text: props.initialValue,
        selection: { start: props.initialValue.length, end: props.initialValue.length }
    }));

    const onChangeTextProp = props.onChangeText;
    const handleTextChange = React.useCallback((text: string) => {
        React.startTransition(() => {
            setHasText(text.trim().length > 0);
        });
        onChangeTextProp?.(text);
    }, [onChangeTextProp]);

    const handleInputStateChange = React.useCallback((newState: TextInputState) => {
        React.startTransition(() => {
            setInputState(newState);
        });
    }, []);

    // Use the tracked selection from inputState
    const activeWord = useActiveWord(inputState.text, inputState.selection, props.autocompletePrefixes);
    // Using default options: clampSelection=true, autoSelectFirst=true, wrapAround=true
    // To customize: useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: false, wrapAround: false })
    const [suggestions, selected, moveUp, moveDown] = useActiveSuggestions(activeWord, props.autocompleteSuggestions, { clampSelection: true, wrapAround: true });

    // Debug logging
    // React.useEffect(() => {
    //     console.log('🔍 Autocomplete Debug:', JSON.stringify({
    //         value: props.value,
    //         inputState,
    //         activeWord,
    //         suggestionsCount: suggestions.length,
    //         selected,
    //         prefixes: props.autocompletePrefixes
    //     }, null, 2));
    // }, [props.value, inputState, activeWord, suggestions.length, selected]);

    // Handle suggestion selection
    const handleSuggestionSelect = React.useCallback((index: number) => {
        if (!suggestions[index] || !inputRef.current) return;

        const suggestion = suggestions[index];

        // Apply the suggestion
        const result = applySuggestion(
            inputState.text,
            inputState.selection,
            suggestion.text,
            props.autocompletePrefixes,
            true // add space after
        );

        // Use imperative API to set text and selection
        inputRef.current.setTextAndSelection(result.text, {
            start: result.cursorPosition,
            end: result.cursorPosition
        });

        // console.log('Selected suggestion:', suggestion.text);

        // Small haptic feedback
        hapticsLight();
    }, [suggestions, inputState, props.autocompletePrefixes]);

    // Handle abort button press
    const handleAbortPress = React.useCallback(async () => {
        if (!props.onAbort) return;

        hapticsError();
        setIsAborting(true);
        const startTime = Date.now();

        try {
            await props.onAbort?.();

            // Ensure minimum 300ms loading time
            const elapsed = Date.now() - startTime;
            if (elapsed < 300) {
                await new Promise(resolve => setTimeout(resolve, 300 - elapsed));
            }
        } catch (error) {
            // Shake on error
            shakerRef.current?.shake();
            console.error('Abort RPC call failed:', error);
        } finally {
            setIsAborting(false);
        }
    }, [props.onAbort]);

    const handleBlockedSendAttempt = React.useCallback(() => {
        if (!isSendBlocked || !hasText || props.isSending) return;
        hapticsError();
        sendBlockShakerRef.current?.shake();
    }, [hasText, isSendBlocked, props.isSending]);

    const handleSendPress = React.useCallback(() => {
        if (isSendBlocked) {
            handleBlockedSendAttempt();
            return;
        }
        if (props.isSendDisabled || props.isSending) return;

        hapticsLight();
        // Live read avoids stalling behind the transitioned `hasText`.
        const liveHasText = (inputRef.current?.getText() ?? '').trim().length > 0;
        if (liveHasText || hasImages) {
            props.onSend();
        }
    }, [handleBlockedSendAttempt, hasImages, isSendBlocked, props.isSendDisabled, props.isSending, props.onSend]);

    // Handle keyboard navigation
    const handleKeyPress = React.useCallback((event: KeyPressEvent): boolean => {
        // Handle autocomplete navigation first
        if (suggestions.length > 0) {
            if (event.key === 'ArrowUp') {
                moveUp();
                return true;
            } else if (event.key === 'ArrowDown') {
                moveDown();
                return true;
            } else if ((event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
                // Both Enter and Tab select the current suggestion
                // If none selected (selected === -1), select the first one
                const indexToSelect = selected >= 0 ? selected : 0;
                handleSuggestionSelect(indexToSelect);
                return true;
            } else if (event.key === 'Escape') {
                // Clear suggestions by collapsing selection (triggers activeWord to clear)
                if (inputRef.current) {
                    const cursorPos = inputState.selection.start;
                    inputRef.current.setTextAndSelection(inputState.text, {
                        start: cursorPos,
                        end: cursorPos
                    });
                }
                return true;
            }
        }

        // Handle Escape for abort when no suggestions are visible
        if (event.key === 'Escape' && showAbortControl && !isAborting) {
            handleAbortPress();
            return true;
        }

        return false; // Key was not handled
    }, [suggestions, moveUp, moveDown, selected, handleSuggestionSelect, showAbortControl, isAborting, handleAbortPress, inputState.selection.start, inputState.text]);




    return (
        <View style={[
            styles.container,
            { paddingHorizontal: screenWidth > 700 ? 12 : 8 }
        ]}>
            <View style={[
                styles.innerContainer,
                { maxWidth: layout.maxWidth }
            ]}>
                {/* Autocomplete suggestions overlay */}
                {suggestions.length > 0 && (
                    <View style={[
                        styles.autocompleteOverlay,
                        { paddingHorizontal: screenWidth > 700 ? 0 : 8 }
                    ]}>
                        <AgentInputAutocomplete
                            suggestions={suggestions.map(s => {
                                const Component = s.component;
                                return <Component key={s.key} />;
                            })}
                            selectedIndex={selected}
                            onSelect={handleSuggestionSelect}
                            itemHeight={48}
                        />
                    </View>
                )}

                <AgentInputStatusRow
                    connectionStatus={props.connectionStatus}
                    contextWarning={contextWarning}
                />

                <AgentInputContextChips
                    machineName={props.machineName}
                    onMachineClick={props.onMachineClick}
                    currentPath={props.currentPath}
                    onPathClick={props.onPathClick}
                />

                {/* Box 2: Action Area (Input + Send) */}
                <Shaker ref={sendBlockShakerRef}>
                <View style={styles.unifiedPanel}>
                    {/* Attachment preview strip */}
                    {props.selectedImages && props.selectedImages.length > 0 && (
                        <AgentInputAttachmentStrip
                            images={props.selectedImages}
                            onRemove={props.onRemoveImage ?? (() => {})}
                        />
                    )}
                    {/* Input field */}
                    <View style={[styles.inputContainer, props.minHeight ? { minHeight: props.minHeight } : undefined]}>
                        <MultiTextInput
                            ref={inputRef}
                            testID="lyntty-session-input"
                            accessibilityLabel={t('appWide.lynttySessionMessageInput')}
                            defaultValue={props.initialValue}
                            paddingTop={8}
                            paddingBottom={8}
                            onChangeText={handleTextChange}
                            placeholder={props.placeholder}
                            onKeyPress={handleKeyPress}
                            onStateChange={handleInputStateChange}
                            maxHeight={120}
                        />
                    </View>

                    {/* Action buttons below input */}
                    <View style={styles.actionButtonsContainer}>
                        <View style={{ flexDirection: 'column', flex: 1, gap: 2 }}>
                            {/* Row 1: Agent, Abort, Git Status, attachments */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                {props.zenMode && <View style={{ flex: 1 }} />}
                                {!props.zenMode && <View style={styles.actionButtonsLeft}>

                                {/* Agent selector button */}
                                {props.agentType && props.onAgentClick && (
                                    <Pressable
                                        onPress={() => {
                                            hapticsLight();
                                            props.onAgentClick?.();
                                        }}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        style={(p) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            borderRadius: Platform.select({ default: 16, android: 20 }),
                                            paddingHorizontal: 10,
                                            paddingVertical: 6,
                                            justifyContent: 'center',
                                            height: 32,
                                            opacity: p.pressed ? 0.7 : 1,
                                            gap: 6,
                                        })}
                                    >
                                        <Octicons
                                            name="cpu"
                                            size={14}
                                            color={theme.colors.button.secondary.tint}
                                        />
                                        <Text style={{
                                            fontSize: 13,
                                            color: theme.colors.button.secondary.tint,
                                            fontWeight: '600',
                                            ...Typography.default('semiBold'),
                                        }}>
                                            pi
                                        </Text>
                                    </Pressable>
                                )}

                                {/* Abort button */}
                                {showAbortControl && (
                                    <Shaker ref={shakerRef}>
                                        <Pressable
                                            style={(p) => ({
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                borderRadius: Platform.select({ default: 16, android: 20 }),
                                                paddingHorizontal: 8,
                                                paddingVertical: 6,
                                                justifyContent: 'center',
                                                height: 32,
                                                opacity: p.pressed ? 0.7 : 1,
                                            })}
                                            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                            onPress={handleAbortPress}
                                            disabled={isAborting}
                                            testID="lyntty-session-stop"
                                            accessibilityLabel={t('appWide.stopCurrentPiTurn')}
                                        >
                                            {isAborting ? (
                                                <ActivityIndicator
                                                    size="small"
                                                    color={theme.colors.button.secondary.tint}
                                                />
                                            ) : (
                                                <Octicons
                                                    name={"stop"}
                                                    size={16}
                                                    color={theme.colors.button.secondary.tint}
                                                />
                                            )}
                                        </Pressable>
                                    </Shaker>
                                )}

                                {/* Git Status Badge */}
                                <GitStatusButton sessionId={props.sessionId} onPress={props.onFileViewerPress} />

                                {/* Pi image attachment picker */}
                                {props.onPickImages && (
                                    <Pressable
                                        onPress={props.onPickImages}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        style={(p) => ({
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            borderRadius: Platform.select({ default: 16, android: 20 }),
                                            paddingHorizontal: 8,
                                            paddingVertical: 6,
                                            justifyContent: 'center',
                                            height: 32,
                                            opacity: p.pressed ? 0.7 : 1,
                                        })}
                                    >
                                        <Ionicons
                                            name="image-outline"
                                            size={16}
                                            color={(props.selectedImages?.length ?? 0) > 0
                                                ? theme.colors.radio.active
                                                : theme.colors.button.secondary.tint}
                                        />
                                    </Pressable>
                                )}
                                </View>}

                                {/* Send button - aligned with first row */}
                                <View
                                    style={[
                                        styles.sendButton,
                                        isSendBlocked ? styles.sendButtonLocked :
                                        (hasText || hasImages || props.isSending)
                                            ? styles.sendButtonActive
                                            : styles.sendButtonInactive
                                    ]}
                                >
                                    <Pressable
                                        testID="lyntty-session-send"
                                        accessibilityLabel={t('appWide.sendMessage')}
                                        style={(p) => ({
                                            width: '100%',
                                            height: '100%',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            opacity: p.pressed ? 0.7 : 1,
                                        })}
                                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                                        onPress={handleSendPress}
                                        disabled={!canPressSendButton}
                                    >
                                        {props.isSending ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={theme.colors.button.primary.tint}
                                            />
                                        ) : isSendBlocked ? (
                                            <Ionicons
                                                name="lock-closed"
                                                size={15}
                                                color={theme.colors.textSecondary}
                                            />
                                        ) : hasText ? (
                                            <Octicons
                                                name="arrow-up"
                                                size={16}
                                                color={theme.colors.button.primary.tint}
                                                style={[
                                                    styles.sendButtonIcon,
                                                    { marginTop: 0 }
                                                ]}
                                            />
                                        ) : (
                                            <Octicons
                                                name="arrow-up"
                                                size={16}
                                                color={theme.colors.button.primary.tint}
                                                style={[
                                                    styles.sendButtonIcon,
                                                    { marginTop: 0 }
                                                ]}
                                            />
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>
                </Shaker>
            </View>
        </View>
    );
}));

// Git Status Button Component
function GitStatusButton({ sessionId, onPress }: { sessionId?: string, onPress?: () => void }) {
    const hasMeaningfulGitStatus = useHasMeaningfulGitStatus(sessionId || '');
    const styles = stylesheet;
    const { theme } = useUnistyles();

    if (!sessionId || !onPress) {
        return null;
    }

    return (
        <Pressable
            style={(p) => ({
                flexDirection: 'row',
                alignItems: 'center',
                borderRadius: Platform.select({ default: 16, android: 20 }),
                paddingHorizontal: 8,
                paddingVertical: 6,
                height: 32,
                opacity: p.pressed ? 0.7 : 1,
                flex: 1,
                overflow: 'hidden',
            })}
            hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
            onPress={() => {
                hapticsLight();
                onPress?.();
            }}
        >
            {hasMeaningfulGitStatus ? (
                <GitStatusBadge sessionId={sessionId} />
            ) : (
                <Octicons
                    name="git-branch"
                    size={16}
                    color={theme.colors.button.secondary.tint}
                />
            )}
        </Pressable>
    );
}
