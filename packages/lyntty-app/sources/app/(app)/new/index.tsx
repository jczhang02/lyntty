import React from 'react';
import {
    View,
    Text,
    Platform,
    Pressable,
    Modal as RNModal,
    TouchableWithoutFeedback,
    Animated,
    TextInput,
    ScrollView,
    LayoutAnimation,
    ActivityIndicator,
    TextInputSelectionChangeEventData,
    NativeSyntheticEvent,
    useWindowDimensions,
} from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { Ionicons, Octicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { Typography } from '@/constants/Typography';
import { layout } from '@/components/layout';
import {
    MultiTextInput,
    MULTI_TEXT_INPUT_LINE_HEIGHT,
} from '@/components/MultiTextInput';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Constants from 'expo-constants';
import { useHeaderHeight } from '@/utils/responsive';
import { t } from '@/text';
import { storage, useAllMachines, useLocalSetting, useSessions, useSetting } from '@/sync/storage';
import { sync } from '@/sync/sync';
import { isMachineOnline } from '@/utils/machineUtils';
import { machineSpawnNewSession } from '@/sync/ops';
import { createWorktree, listWorktrees } from '@/utils/worktree';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { formatPathRelativeToHome, formatLastSeen } from '@/utils/sessionUtils';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { useNewSessionDraft } from '@/hooks/useNewSessionDraft';
import { useShallow } from 'zustand/react/shallow';
import type { MultiTextInputHandle } from '@/components/MultiTextInput';
import { Modal } from '@/modal';
import type { Machine, Session } from '@/sync/storageTypes';
import { isRunningOnMac } from '@/utils/platform';
import { getNewSessionSidebarLayout } from '@/utils/newSessionSidebarLayout';
import { deliverNewSessionPrompt } from '@/utils/newSessionPrompt';
import {
    advanceWorktreeRequestVersion,
    currentWorktreeItems,
    isCurrentWorktreeSelection,
    type NewSessionWorktreeInventory,
} from '@/utils/newSessionWorktreeInventory';

type PickerItem = { key: string; label: string; subtitle?: string; dimmed?: boolean };

type PickerType = 'machine' | 'path' | 'worktree';

const COMPOSER_INPUT_VERTICAL_PADDING = 8;
const COMPOSER_INPUT_MAX_HEIGHT = 240;
const COMPOSER_SEND_BUTTON_SIZE = 32;
const WORKTREE_PATH_DEBOUNCE_MS = 300;

function trimPathInput(path: string | null | undefined): string {
    return path?.trim() ?? '';
}

function trimTrailingPathSeparator(path: string): string {
    if (path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)) {
        return path;
    }
    return path.replace(/[\\/]+$/, '');
}

function normalizePathForComparison(path: string | null | undefined, homeDir?: string): string | null {
    const trimmed = trimPathInput(path);
    if (!trimmed) {
        return null;
    }
    return trimTrailingPathSeparator(resolveAbsolutePath(trimmed, homeDir));
}

// Bottom sheet modal — native formSheet on iOS, slide-up sheet on Android
function BottomSheet({
    visible,
    onClose,
    children,
}: {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();

    if (Platform.OS === 'ios') {
        return (
            <RNModal
                visible={visible}
                animationType="slide"
                presentationStyle="formSheet"
                onRequestClose={onClose}
            >
                <View style={[sheetStyles.iosContainer, { backgroundColor: theme.colors.header.background }]}>
                    <View style={sheetStyles.handleRow}>
                        <View style={[sheetStyles.handle, { backgroundColor: theme.colors.textSecondary }]} />
                    </View>
                    {children}
                    <View style={{ height: safeArea.bottom }} />
                </View>
            </RNModal>
        );
    }

    // Android: slide-up sheet with backdrop
    const fadeAnim = React.useRef(new Animated.Value(0)).current;
    const slideAnim = React.useRef(new Animated.Value(300)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
                Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
                Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [visible, fadeAnim, slideAnim]);

    return (
        <RNModal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={sheetStyles.overlay}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <Animated.View style={[sheetStyles.backdrop, { opacity: fadeAnim }]} />
                </TouchableWithoutFeedback>
                <Animated.View
                    style={[
                        sheetStyles.sheet,
                        {
                            backgroundColor: theme.colors.header.background,
                            paddingBottom: Math.max(16, safeArea.bottom),
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    <View style={sheetStyles.handleRow}>
                        <View style={[sheetStyles.handle, { backgroundColor: theme.colors.textSecondary }]} />
                    </View>
                    {children}
                </Animated.View>
            </View>
        </RNModal>
    );
}

// Generic picker content — reused for machine, path, and worktree selection
function PickerContent({
    title,
    fixedItems,
    items,
    selectedKey,
    onSelect,
    searchPlaceholder,
}: {
    title: string;
    fixedItems?: PickerItem[];
    items: PickerItem[];
    selectedKey: string | null;
    onSelect: (key: string) => void;
    searchPlaceholder?: string;
}) {
    const { theme } = useUnistyles();
    const [search, setSearch] = React.useState('');

    const filtered = React.useMemo(() => {
        if (!search) return items;
        const q = search.toLowerCase();
        return items.filter(item => item.label.toLowerCase().includes(q));
    }, [search, items]);

    const renderOption = (item: PickerItem) => {
        const isSelected = item.key === selectedKey;
        return (
            <Pressable
                key={item.key}
                style={(p) => [
                    pickerStyles.option,
                    p.pressed && pickerStyles.optionPressed,
                    item.dimmed && { opacity: 0.45 },
                ]}
                onPress={() => onSelect(item.key)}
            >
                <Octicons
                    name={isSelected ? 'check-circle-fill' : 'circle'}
                    size={16}
                    color={isSelected ? theme.colors.button.primary.background : theme.colors.textSecondary}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[pickerStyles.optionText, { color: theme.colors.text }]} numberOfLines={1}>
                        {item.label}
                    </Text>
                    {item.subtitle && (
                        <Text style={[pickerStyles.optionText, { color: theme.colors.textSecondary, fontSize: 13 }]} numberOfLines={1}>
                            {item.subtitle}
                        </Text>
                    )}
                </View>
            </Pressable>
        );
    };

    return (
        <View style={pickerStyles.container}>
            <Text style={[pickerStyles.title, { color: theme.colors.text }]}>{title}</Text>

            <View style={[pickerStyles.searchRow, { backgroundColor: theme.colors.input.background }]}>
                <Ionicons name="search" size={16} color={theme.colors.textSecondary} />
                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={searchPlaceholder ?? t('appWide.search')}
                    placeholderTextColor={theme.colors.textSecondary}
                    style={[pickerStyles.searchInput, { color: theme.colors.text }]}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            <ScrollView
                style={pickerStyles.optionList}
                keyboardShouldPersistTaps="handled"
            >
                {fixedItems?.map(renderOption)}
                {fixedItems && fixedItems.length > 0 && filtered.length > 0 && (
                    <View style={[pickerStyles.divider, { backgroundColor: theme.colors.divider }]} />
                )}
                {filtered.map(renderOption)}
                {filtered.length === 0 && search.length > 0 && (
                    <Text style={[pickerStyles.emptyText, { color: theme.colors.textSecondary }]}>{t('appWide.noResults')}</Text>
                )}
            </ScrollView>
        </View>
    );
}

function PathPickerContent({
    title,
    items,
    value,
    homeDir,
    onChangeValue,
    onDone,
}: {
    title: string;
    items: PickerItem[];
    value: string | null;
    homeDir?: string;
    onChangeValue: (value: string) => void;
    onDone?: () => void;
}) {
    const { theme } = useUnistyles();
    const inputRef = React.useRef<TextInput>(null);
    const currentValue = value ?? '';
    const [selection, setSelection] = React.useState<{ start: number; end: number } | undefined>(undefined);

    React.useEffect(() => {
        const timeout = setTimeout(() => {
            inputRef.current?.focus();
        }, 50);
        return () => clearTimeout(timeout);
    }, []);

    const matchedItemKey = React.useMemo(() => {
        const normalizedValue = normalizePathForComparison(currentValue, homeDir);
        if (!normalizedValue) {
            return null;
        }

        const match = items.find((item) =>
            normalizePathForComparison(item.key, homeDir) === normalizedValue,
        );

        return match?.key ?? null;
    }, [currentValue, homeDir, items]);

    const handleSuggestionPress = React.useCallback((item: PickerItem) => {
        const nextValue = item.label;
        const nextSelection = { start: nextValue.length, end: nextValue.length };

        onChangeValue(nextValue);
        setSelection(nextSelection);

        setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
    }, [onChangeValue]);

    const isCustomPath = currentValue.trim().length > 0 && matchedItemKey === null;
    const handleSelectionChange = React.useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
        setSelection(event.nativeEvent.selection);
    }, []);
    const doneIconColor = theme.colors.header.tint;

    return (
        <View style={pickerStyles.container}>
            <View style={pickerStyles.titleRow}>
                <Text style={[pickerStyles.title, { color: theme.colors.text }]}>{title}</Text>
                {onDone && (
                    <Pressable
                        onPress={onDone}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={({ pressed }) => [
                            pickerStyles.doneButtonPressable,
                            { opacity: pressed ? 0.82 : 1 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={t('appWide.done')}
                    >
                        <GlassView
                            glassEffectStyle="regular"
                            tintColor="rgba(255,255,255,0.10)"
                            isInteractive={true}
                            style={[
                                pickerStyles.doneButtonGlass,
                                { borderColor: 'rgba(255,255,255,0.16)' },
                            ]}
                        >
                            <Ionicons
                                name="checkmark"
                                size={20}
                                color={doneIconColor}
                            />
                        </GlassView>
                    </Pressable>
                )}
            </View>

            <View
                style={[
                    pickerStyles.pathInputRow,
                    {
                        backgroundColor: theme.colors.input.background,
                        borderColor: theme.colors.divider,
                    },
                ]}
            >
                <Ionicons name="folder-outline" size={16} color={theme.colors.textSecondary} />
                <View style={pickerStyles.pathInputField}>
                    <TextInput
                        ref={inputRef}
                        value={currentValue}
                        onChangeText={onChangeValue}
                        onSelectionChange={handleSelectionChange}
                        selection={selection}
                        placeholder={t('appWide.enterProjectPath')}
                        placeholderTextColor={theme.colors.textSecondary}
                        style={[
                            pickerStyles.pathTextInput,
                            { color: theme.colors.text },
                        ]}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline={false}
                        numberOfLines={1}
                        returnKeyType="done"
                        onSubmitEditing={onDone}
                    />
                </View>
            </View>

            {isCustomPath && (
                <Text style={[pickerStyles.pathMetaText, { color: theme.colors.textSecondary }]}>{t('appWide.usingCustomPathAbove')}</Text>
            )}

            <Text style={[pickerStyles.sectionLabel, { color: theme.colors.textSecondary }]}>{t('appWide.recent')}</Text>

            <ScrollView
                style={pickerStyles.optionList}
                keyboardShouldPersistTaps="handled"
            >
                {items.map((item) => {
                    const isSelected = item.key === matchedItemKey;

                    return (
                        <Pressable
                            key={item.key}
                            style={(p) => [
                                pickerStyles.option,
                                p.pressed && pickerStyles.optionPressed,
                            ]}
                            onPress={() => handleSuggestionPress(item)}
                        >
                            <Ionicons
                                name="folder-outline"
                                size={16}
                                color={theme.colors.textSecondary}
                            />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={[pickerStyles.optionText, { color: theme.colors.text }]} numberOfLines={1}>
                                    {item.label}
                                </Text>
                            </View>
                            {isSelected && (
                                <Ionicons
                                    name="checkmark-circle"
                                    size={18}
                                    color={theme.colors.button.primary.background}
                                />
                            )}
                        </Pressable>
                    );
                })}

                {items.length === 0 && (
                    <Text style={[pickerStyles.emptyText, { color: theme.colors.textSecondary }]}>{t('appWide.noRecentProjectsYet')}</Text>
                )}
            </ScrollView>
        </View>
    );
}

// Helper: get machine display name
function getMachineName(machine: Machine): string {
    return machine.metadata?.displayName || machine.metadata?.host || 'unknown';
}

// Owns the `input` subscription so the parent screen can stay decoupled from
// keystroke-rate state changes. Memoized: parent re-renders (e.g. when
// `canSend` flips or a picker opens) won't force the input to re-render
// because all of its props are stable.
type PromptInputProps = {
    placeholder: string;
};
const PromptInput = React.memo(React.forwardRef<MultiTextInputHandle, PromptInputProps>(
    function PromptInput(props, ref) {
        const value = useNewSessionDraft((s) => s.input);
        const onChangeText = useNewSessionDraft((s) => s.setInput);
        return (
            <MultiTextInput
                ref={ref}
                value={value}
                onChangeText={onChangeText}
                placeholder={props.placeholder}
                lineHeight={MULTI_TEXT_INPUT_LINE_HEIGHT}
                paddingTop={COMPOSER_INPUT_VERTICAL_PADDING}
                paddingBottom={COMPOSER_INPUT_VERTICAL_PADDING}
                maxHeight={COMPOSER_INPUT_MAX_HEIGHT}
            />
        );
    },
));

function NewSessionScreen() {
    const { theme } = useUnistyles();
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    const router = useRouter();
    const navigation = useNavigation();
    const navigateToSession = useNavigateToSession();

    // Real data sources
    const allMachines = useAllMachines({ includeOffline: true });
    const sessions = useSessions();
    const fileDiffsSidebarEnabled = useSetting('fileDiffsSidebar');
    const zenMode = useLocalSetting('zenMode');
    const { width: windowWidth } = useWindowDimensions();

    // Persisted draft state (survives navigation).
    //
    // We deliberately do NOT subscribe to `input` at the parent level here:
    // typing flips `input` on every keystroke, and a parent re-render would
    // cascade through the whole config box, machine/path pickers, and all
    // the heavy `useMemo`s below. Instead, the input subtree (PromptInput)
    // owns the subscription, the parent only listens to a derived
    // `hasText` boolean for the auto-collapse effect, and `handleSend`
    // reads the live value via `useNewSessionDraft.getState()` on demand.
    const draft = useNewSessionDraft(useShallow((s) => ({
        selectedMachineId: s.selectedMachineId,
        setMachineId: s.setMachineId,
        selectedPath: s.selectedPath,
        setPath: s.setPath,
        sessionType: s.sessionType,
        setSessionType: s.setSessionType,
        worktreeKey: s.worktreeKey,
        setWorktreeKey: s.setWorktreeKey,
    })));
    const hasText = useNewSessionDraft((s) => s.input.trim().length > 0);
    const selectedMachineId = draft.selectedMachineId;
    const setSelectedMachineId = draft.setMachineId;
    const selectedPath = draft.selectedPath;
    const setSelectedPath = draft.setPath;
    const worktreeKey = draft.worktreeKey
        ?? (draft.sessionType === 'worktree' ? '__new__' : '__none__');
    const setWorktreeKey = React.useCallback((key: string) => {
        draft.setSessionType(key === '__none__' ? 'simple' : 'worktree');
        draft.setWorktreeKey(key === '__none__' || key === '__new__' ? null : key);
    }, [draft.setSessionType, draft.setWorktreeKey]);

    // Local-only UI state (not persisted)
    const [isSpawning, setIsSpawning] = React.useState(false);
    const [activePicker, setActivePicker] = React.useState<PickerType | null>(null);
    const [worktreeRefreshNonce, setWorktreeRefreshNonce] = React.useState(0);

    // Config collapse — auto-collapses when typing, expands when empty
    const [isConfigExpanded, setIsConfigExpanded] = React.useState(true);

    // Auto-select first machine when none selected (first-ever use, no draft)
    React.useEffect(() => {
        if (selectedMachineId) return;
        if (allMachines.length > 0) {
            setSelectedMachineId(allMachines[0].id);
        }
    }, [allMachines, selectedMachineId]);

    const selectedMachine = React.useMemo(
        () => allMachines.find(m => m.id === selectedMachineId) ?? null,
        [allMachines, selectedMachineId],
    );
    const selectedHomeDir = selectedMachine?.metadata?.homeDir;

    // Build machine picker items: online first, then offline
    const machineItems = React.useMemo<PickerItem[]>(() => {
        const sorted = [...allMachines].sort((a, b) => {
            const aOnline = isMachineOnline(a) ? 0 : 1;
            const bOnline = isMachineOnline(b) ? 0 : 1;
            return aOnline - bOnline;
        });
        return sorted.map(m => ({
            key: m.id,
            label: getMachineName(m),
            subtitle: isMachineOnline(m) ? t('status.online') : t('status.lastSeen', { time: formatLastSeen(m.activeAt, false) }),
            dimmed: !isMachineOnline(m),
        }));
    }, [allMachines]);

    // Build path items from session history for selected machine
    const pathItems = React.useMemo<PickerItem[]>(() => {
        if (!selectedMachineId || !sessions) return [];
        const paths = new Set<string>();
        for (const s of sessions) {
            if (typeof s === 'string') continue;
            const session = s as Session;
            if (session.metadata?.machineId === selectedMachineId && session.metadata?.path) {
                paths.add(session.metadata.path);
            }
        }
        const homeDir = selectedMachine?.metadata?.homeDir;
        return Array.from(paths).sort().map(p => ({
            key: p,
            label: formatPathRelativeToHome(p, homeDir),
        }));
    }, [selectedMachineId, sessions, selectedMachine]);

    // Auto-select first path when machine changes
    React.useEffect(() => {
        if (!selectedMachineId || selectedPath !== null) {
            return;
        }

        setSelectedPath(pathItems[0]?.label ?? '~');
    }, [selectedMachineId, pathItems, selectedPath, setSelectedPath]);

    const resolvedSelectedPath = React.useMemo(() => {
        return normalizePathForComparison(selectedPath, selectedHomeDir);
    }, [selectedHomeDir, selectedPath]);

    const [debouncedResolvedSelectedPath, setDebouncedResolvedSelectedPath] = React.useState<string | null>(resolvedSelectedPath);

    React.useEffect(() => {
        if (!resolvedSelectedPath) {
            setDebouncedResolvedSelectedPath(null);
            return;
        }

        const timeout = setTimeout(() => {
            setDebouncedResolvedSelectedPath(resolvedSelectedPath);
        }, WORKTREE_PATH_DEBOUNCE_MS);

        return () => clearTimeout(timeout);
    }, [resolvedSelectedPath]);

    // Bind every fetched worktree list to the exact machine/base-path/request
    // generation that produced it. The generation changes synchronously during
    // render, so old results disappear before the refresh effect runs.
    const selectedMachineOnline = selectedMachine ? isMachineOnline(selectedMachine) : false;
    const worktreeRequestIdentity = JSON.stringify([
        selectedMachineId,
        resolvedSelectedPath,
        selectedMachineOnline,
        worktreeRefreshNonce,
    ]);
    const worktreeRequestRef = React.useRef({ identity: '', generation: 0 });
    worktreeRequestRef.current = advanceWorktreeRequestVersion(
        worktreeRequestRef.current,
        worktreeRequestIdentity,
    );
    const worktreeRequestGeneration = worktreeRequestRef.current.generation;
    const [worktreeInventory, setWorktreeInventory] = React.useState<NewSessionWorktreeInventory<PickerItem> | null>(null);
    const worktreeItems = React.useMemo(
        () => currentWorktreeItems(
            worktreeInventory,
            selectedMachineId,
            resolvedSelectedPath,
            worktreeRequestGeneration,
        ),
        [worktreeInventory, selectedMachineId, resolvedSelectedPath, worktreeRequestGeneration],
    );
    React.useEffect(() => {
        if (
            !selectedMachineId
            || !resolvedSelectedPath
            || debouncedResolvedSelectedPath !== resolvedSelectedPath
            || !selectedMachineOnline
        ) {
            setWorktreeInventory(null);
            return;
        }
        let cancelled = false;
        const machineId = selectedMachineId;
        const basePath = resolvedSelectedPath;
        const generation = worktreeRequestGeneration;
        setWorktreeInventory({ machineId, basePath, generation, status: 'loading', items: [] });
        listWorktrees(machineId, basePath).then(result => {
            if (cancelled) return;
            if (!result.success) {
                setWorktreeInventory({
                    machineId,
                    basePath,
                    generation,
                    status: 'error',
                    items: [],
                    error: result.error,
                });
                return;
            }
            setWorktreeInventory({
                machineId,
                basePath,
                generation,
                status: 'success',
                items: result.worktrees.map(wt => ({
                    key: wt.path,
                    label: wt.branch,
                    subtitle: wt.path,
                })),
            });
        }).catch(error => {
            if (cancelled) return;
            setWorktreeInventory({
                machineId,
                basePath,
                generation,
                status: 'error',
                items: [],
                error: error instanceof Error ? error.message : 'Failed to list worktrees',
            });
        });
        return () => { cancelled = true; };
    }, [debouncedResolvedSelectedPath, resolvedSelectedPath, selectedMachineId, selectedMachineOnline, worktreeRequestGeneration]);

    // Auto collapse config once when user starts typing on phones and tablets.
    // On Mac Catalyst the panel stays expanded.
    // Also skip collapsing on the initial render when draft text is restored
    const hasCollapsedOnceRef = React.useRef(false);
    const isInitialRef = React.useRef(true);
    const isDesktop = isRunningOnMac();
    React.useEffect(() => {
        if (isInitialRef.current) {
            isInitialRef.current = false;
            return;
        }
        if (isDesktop) return;
        if (hasText && !hasCollapsedOnceRef.current) {
            hasCollapsedOnceRef.current = true;
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIsConfigExpanded(false);
        }
    }, [hasText]);


    const toggleConfig = React.useCallback(() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setActivePicker(null);
        setIsConfigExpanded(v => !v);
    }, []);

    const togglePicker = React.useCallback((type: PickerType) => {
        const nextPicker = activePicker === type ? null : type;
        if (nextPicker === 'worktree') {
            setWorktreeRefreshNonce(value => value + 1);
        }
        setActivePicker(nextPicker);
    }, [activePicker]);

    const isOffline = selectedMachine ? !isMachineOnline(selectedMachine) : false;

    // Display values
    const machineName = selectedMachine ? getMachineName(selectedMachine) : 'Select machine';
    const pathName = trimPathInput(selectedPath)
        ? formatPathRelativeToHome(trimPathInput(selectedPath), selectedHomeDir)
        : '~';
    const worktreeLabel = worktreeKey === '__none__'
        ? 'no worktree'
        : worktreeKey === '__new__'
            ? 'new worktree'
            : worktreeItems.find(wt => wt.key === worktreeKey)?.label || worktreeKey;

    // Picker data derived from active picker type
    const pickerData = React.useMemo(() => {
        switch (activePicker) {
            case 'machine':
                return { title: t('appWide.machine'), items: machineItems, selectedKey: selectedMachineId, searchPlaceholder: 'search machines...' };
            case 'worktree':
                return { title: t('appWide.worktree'), fixedItems: WORKTREE_FIXED_ITEMS, items: worktreeItems, selectedKey: worktreeKey, searchPlaceholder: 'search worktrees...' };
            default:
                return null;
        }
    }, [
        activePicker,
        machineItems,
        selectedMachineId,
        worktreeKey,
        worktreeItems,
    ]);

    const handlePickerSelect = React.useCallback((key: string) => {
        switch (activePicker) {
            case 'machine':
                setWorktreeKey('__none__');
                setSelectedMachineId(key);
                break;
            case 'worktree':
                setWorktreeKey(isCurrentWorktreeSelection(
                    key,
                    worktreeInventory,
                    selectedMachineId,
                    resolvedSelectedPath,
                    worktreeRequestGeneration,
                ) ? key : '__none__');
                break;
        }
        setActivePicker(null);
    }, [activePicker, resolvedSelectedPath, selectedMachineId, setSelectedMachineId, setWorktreeKey, worktreeInventory, worktreeRequestGeneration]);

    const handlePathChange = React.useCallback((value: string) => {
        setWorktreeKey('__none__');
        setSelectedPath(value);
    }, [setSelectedPath]);

    // Spawn session handler
    const handleSend = React.useCallback(async (approvedNewDirectoryCreation: boolean = false) => {
        if (!selectedMachineId || !selectedMachine) {
            Modal.alert(t('common.error'), t('appWide.pleaseSelectAMachine'));
            return;
        }
        if (!isMachineOnline(selectedMachine)) {
            Modal.alert(t('common.error'), t('appWide.machineIsOffline'));
            return;
        }

        setIsSpawning(true);
        try {
            const pathToUse = trimPathInput(selectedPath) || '~';
            const absolutePath = resolveAbsolutePath(pathToUse, selectedMachine.metadata?.homeDir);

            // Handle worktree selection
            let spawnDirectory = absolutePath;
            if (worktreeKey === '__new__') {
                const worktreeResult = await createWorktree(selectedMachineId, absolutePath);
                if (!worktreeResult.success) {
                    Modal.alert(t('common.error'), worktreeResult.error || t('appWide.failedToCreateWorktree'));
                    return;
                }
                spawnDirectory = worktreeResult.worktreePath;
            } else if (worktreeKey !== '__none__') {
                if (!isCurrentWorktreeSelection(
                    worktreeKey,
                    worktreeInventory,
                    selectedMachineId,
                    resolvedSelectedPath,
                    worktreeRequestGeneration,
                )) {
                    Modal.alert(t('common.error'), t('appWide.failedToCreateWorktree'));
                    return;
                }
                spawnDirectory = worktreeKey;
            }

            const result = await machineSpawnNewSession({
                machineId: selectedMachineId,
                directory: spawnDirectory,
                approvedNewDirectoryCreation,
                agent: 'pi',
            });

            switch (result.type) {
                case 'success':
                    await sync.refreshSessions();

                    // Read the prompt imperatively so the parent remains outside
                    // the per-keystroke render path. Clear only after durable queueing;
                    // otherwise transfer it to the created Session Remote draft.
                    const rawPrompt = useNewSessionDraft.getState().input;
                    const delivery = await deliverNewSessionPrompt({
                        rawPrompt,
                        send: (prompt) => sync.sendMessage(result.sessionId, prompt, { source: 'new_session' }),
                        clearIfUnchanged: (expected) => {
                            const current = useNewSessionDraft.getState();
                            if (current.input === expected) current.setInput('');
                        },
                        preserveForSession: (prompt) => {
                            storage.getState().updateSessionDraft(result.sessionId, prompt);
                        },
                    });
                    if (delivery.error) {
                        Modal.alert(t('common.error'), t('appWide.messageFailed'));
                    }

                    router.back();
                    navigateToSession(result.sessionId);
                    break;
                case 'requestToApproveDirectoryCreation': {
                    const approved = await Modal.confirm(
                        t('appWide.createDirectory'),
                        t('appWide.theDirectoryValueDoesNotExistWouldYouLike', { value0: result.directory }),
                        { cancelText: t('common.cancel'), confirmText: t('common.create') },
                    );
                    if (approved) {
                        await handleSend(true);
                    }
                    break;
                }
                case 'error':
                    Modal.alert(t('common.error'), result.errorMessage);
                    break;
            }
        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : 'Failed to start session';
            Modal.alert(t('common.error'), errorMessage);
        } finally {
            setIsSpawning(false);
        }
    }, [selectedMachineId, selectedMachine, selectedPath, resolvedSelectedPath, router, navigateToSession, worktreeInventory, worktreeKey, worktreeRequestGeneration]);

    const canSend = Boolean(
        selectedMachineId
        && selectedMachine
        && isMachineOnline(selectedMachine)
        && !isSpawning
        && isCurrentWorktreeSelection(
            worktreeKey,
            worktreeInventory,
            selectedMachineId,
            resolvedSelectedPath,
            worktreeRequestGeneration,
        )
    );
    const sidebarLayout = getNewSessionSidebarLayout({
        isMac: isRunningOnMac(),
        fileDiffsSidebarEnabled,
        zenMode,
        windowWidth,
    });
    React.useLayoutEffect(() => {
        navigation.setOptions({ headerShown: !sidebarLayout.showSidebar });
        return () => navigation.setOptions({ headerShown: true });
    }, [navigation, sidebarLayout.showSidebar]);

    // Auto-focus the text input when the composer mounts
    const composerInputRef = React.useRef<import('@/components/MultiTextInput').MultiTextInputHandle>(null);
    React.useEffect(() => {
        const timeout = setTimeout(() => {
            composerInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timeout);
    }, []);

    const configContent = (
        <>
            <View style={[
                styles.configBox,
                sidebarLayout.showSidebar && styles.sidebarConfigBox,
            ]}>
                {sidebarLayout.showSidebar || isConfigExpanded ? (
                    <>
                        <View style={styles.configRowWithToggle}>
                            <Pressable
                                style={(p) => [
                                    styles.configRow,
                                    { flex: 1 },
                                    p.pressed && styles.configRowPressed,
                                ]}
                                onPress={() => togglePicker('machine')}
                            >
                                <Ionicons name="desktop-outline" size={15} color={theme.colors.textSecondary} />
                                <Text style={[styles.configLabel, styles.configValueText]} numberOfLines={1}>
                                    {machineName}
                                </Text>
                                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} />
                            </Pressable>
                            {!sidebarLayout.showSidebar && (
                                <Pressable
                                    onPress={toggleConfig}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    style={(p) => [styles.collapseToggle, p.pressed && styles.configRowPressed]}
                                >
                                    <Ionicons name="chevron-up" size={16} color={theme.colors.textSecondary} />
                                </Pressable>
                            )}
                        </View>
                        {isOffline && (
                            <View style={styles.offlineHelp}>
                                <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.status.disconnected} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.offlineHelpTitle, { color: theme.colors.status.disconnected }]}>
                                        {t('newSession.machineOffline')}
                                    </Text>
                                    <Text style={[styles.offlineHelpText, { color: theme.colors.textSecondary }]}>
                                        {t('machine.offlineHelp')}
                                        {'\n'}{t('newSession.switchMachinesHint')}
                                    </Text>
                                </View>
                            </View>
                        )}

                        <View style={{ opacity: isOffline ? 0.4 : 1 }} pointerEvents={isOffline ? 'none' : 'auto'}>
                            <Pressable
                                style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                                onPress={() => togglePicker('path')}
                            >
                                <Ionicons name="folder-outline" size={15} color={theme.colors.textSecondary} />
                                <Text style={[styles.configLabel, styles.configValueText]} numberOfLines={1}>
                                    {pathName}
                                </Text>
                                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} />
                            </Pressable>
                            <Pressable
                                style={(p) => [styles.configRow, p.pressed && styles.configRowPressed]}
                                onPress={() => togglePicker('worktree')}
                            >
                                <MaterialCommunityIcons name="tree" size={15} color={theme.colors.textSecondary} />
                                <Text style={[styles.configLabel, styles.configValueText]} numberOfLines={1}>
                                    {worktreeLabel}
                                </Text>
                                <Ionicons name="chevron-down" size={13} color={theme.colors.textSecondary} />
                            </Pressable>
                        </View>
                    </>
                ) : (
                    <>
                        <View style={styles.configRowWithToggle}>
                            <Pressable
                                style={(p) => [styles.collapsedRow, { flex: 1 }, p.pressed && styles.configRowPressed]}
                                onPress={() => togglePicker('path')}
                            >
                                <Ionicons name="folder-outline" size={15} color={theme.colors.textSecondary} />
                                <Text style={[styles.configLabel, { flex: 1 }]} numberOfLines={1}>
                                    {pathName}
                                </Text>
                            </Pressable>
                            <Pressable
                                onPress={toggleConfig}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                style={(p) => [styles.collapseToggle, p.pressed && styles.configRowPressed]}
                            >
                                <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
                            </Pressable>
                        </View>
                        <View style={styles.collapsedIconsRow}>
                            <Pressable
                                onPress={() => togglePicker('machine')}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                            >
                                <Ionicons name="desktop-outline" size={14} color={isOffline ? theme.colors.status.disconnected : theme.colors.textSecondary} />
                            </Pressable>

                            <Pressable
                                onPress={() => togglePicker('worktree')}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                                style={(p) => [styles.collapsedIconButton, p.pressed && styles.configRowPressed]}
                            >
                                <MaterialCommunityIcons name="tree" size={14} color={theme.colors.textSecondary} />
                            </Pressable>
                        </View>
                        {isOffline && (
                            <View style={styles.offlineHelp}>
                                <Ionicons name="cloud-offline-outline" size={14} color={theme.colors.status.disconnected} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.offlineHelpTitle, { color: theme.colors.status.disconnected }]}>
                                        {t('newSession.machineOffline')}
                                    </Text>
                                    <Text style={[styles.offlineHelpText, { color: theme.colors.textSecondary }]}>
                                        {t('machine.offlineHelp')}
                                        {'\n'}{t('newSession.switchMachinesHint')}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </>
                )}
            </View>
        </>
    );

    const composerNode = (
        <View style={styles.inputBox}>
            <View style={styles.inputField}>
                <PromptInput
                    ref={composerInputRef}
                    placeholder={t('appWide.whatWouldYouLikeToWorkOn')}
                />
            </View>
            <View style={styles.actionButtonsContainer}>
                <View style={styles.actionButtonsLeft} />
                <View style={[
                    styles.sendButton,
                    isSpawning ? styles.sendButtonActive :
                    canSend ? styles.sendButtonActive : styles.sendButtonInactive,
                ]}>
                    <Pressable
                        style={(p) => [
                            styles.sendButtonInner,
                            p.pressed && styles.sendButtonInnerPressed,
                        ]}
                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                        disabled={!canSend}
                        onPress={() => handleSend()}
                    >
                        {isSpawning ? (
                            <ActivityIndicator
                                size="small"
                                color={theme.colors.button.primary.tint}
                            />
                        ) : (
                            <Octicons
                                name="arrow-up"
                                size={16}
                                color={theme.colors.button.primary.tint}
                                style={[
                                    styles.sendButtonIcon,
                                    { marginTop: 0 },
                                ]}
                            />
                        )}
                    </Pressable>
                </View>
            </View>
        </View>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' && !sidebarLayout.showSidebar ? Constants.statusBarHeight + headerHeight : 0}
            style={styles.container}
        >
            {sidebarLayout.showSidebar ? (
                <View style={styles.desktopShell}>
                    <View style={styles.desktopMain}>
                        <View style={styles.centeredComposerWrap}>
                            <View style={styles.desktopPromptCluster}>
                                <Text style={styles.desktopPromptTitle}>
                                    {t('newSession.title')}
                                </Text>
                                <View style={styles.composerWidthWrap}>
                                    {composerNode}
                                </View>
                            </View>
                        </View>
                    </View>
                    <View style={[styles.rightSidebar, { width: sidebarLayout.sidebarWidth }]}>
                        <ScrollView
                            style={styles.rightSidebarScroll}
                            contentContainerStyle={styles.rightSidebarContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {configContent}
                        </ScrollView>
                    </View>
                </View>
            ) : (
                <View style={styles.inner}>
                    <View style={styles.inlineConfigWrap}>
                        {configContent}
                    </View>

                    <View style={{ flex: 1 }} />

                    <View style={styles.inlineComposerWrap}>
                        {composerNode}
                    </View>

                    <View style={{ height: Math.max(16, safeArea.bottom) }} />
                </View>
            )}

            <BottomSheet
                visible={!!activePicker}
                onClose={() => setActivePicker(null)}
            >
                {activePicker === 'path' ? (
                    <PathPickerContent
                        title={t('appWide.project')}
                        items={pathItems}
                        value={selectedPath}
                        homeDir={selectedHomeDir}
                        onChangeValue={handlePathChange}
                        onDone={() => setActivePicker(null)}
                    />
                ) : pickerData ? (
                    <PickerContent {...pickerData} onSelect={handlePickerSelect} />
                ) : null}
            </BottomSheet>
        </KeyboardAvoidingView>
    );
}

const WORKTREE_FIXED_ITEMS: PickerItem[] = [
    { key: '__none__', label: t('appWide.noWorktree') },
    { key: '__new__', label: t('appWide.newWorktree') },
];

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.header.background,
    },
    inner: {
        flex: 1,
    },
    desktopShell: {
        flex: 1,
        flexDirection: 'row',
        position: 'relative',
    },
    desktopMain: {
        flex: 1,
        minWidth: 0,
    },
    centeredComposerWrap: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
    },
    desktopPromptCluster: {
        width: '100%',
        alignItems: 'center',
        gap: 32,
        transform: [{ translateY: -28 }],
    },
    desktopPromptTitle: {
        fontSize: 30,
        lineHeight: 36,
        color: theme.colors.text,
        textAlign: 'center',
        ...Typography.default(),
    },
    composerWidthWrap: {
        maxWidth: layout.maxWidth,
        width: '100%',
    },
    rightSidebar: {
        flexShrink: 0,
        alignSelf: 'stretch',
        backgroundColor: theme.colors.groupped.background,
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderLeftColor: theme.colors.divider,
        zIndex: 2,
    },
    rightSidebarScroll: {
        flex: 1,
    },
    rightSidebarContent: {
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 16,
        gap: 8,
    },
    inlineConfigWrap: {
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 12,
        gap: 8,
        paddingTop: 12,
    },
    inlineComposerWrap: {
        maxWidth: layout.maxWidth,
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 12,
        gap: 8,
    },
    configBox: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        paddingVertical: 4,
        paddingHorizontal: 4,
        overflow: 'hidden',
    },
    sidebarConfigBox: {
        backgroundColor: 'transparent',
        borderRadius: 0,
        paddingVertical: 0,
        paddingHorizontal: 0,
        overflow: 'visible',
    },
    configRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minWidth: 0,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    configRowWithToggle: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    collapseToggle: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    collapsedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    collapsedIconsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        paddingHorizontal: 4,
        paddingBottom: 8,
    },
    collapsedIconButton: {
        width: 34,
        height: 28,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    flashLabel: {
        alignSelf: 'center',
        paddingVertical: 4,
    },
    flashLabelText: {
        fontSize: 12,
        ...Typography.default(),
    },
    configRowPressed: {
        opacity: 0.6,
    },
    configLabel: {
        minWidth: 0,
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    configValueText: {
        flex: 1,
        flexShrink: 1,
    },
    inputBox: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ default: 16, android: 20 }),
        overflow: 'hidden',
        paddingVertical: 2,
        paddingBottom: 8,
        paddingHorizontal: 8,
    },
    inputField: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 8,
        paddingVertical: 4,
        minHeight: 40,
    },
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
    sendButton: {
        width: COMPOSER_SEND_BUTTON_SIZE,
        height: COMPOSER_SEND_BUTTON_SIZE,
        borderRadius: COMPOSER_SEND_BUTTON_SIZE / 2,
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
    offlineHelp: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
    },
    offlineHelpTitle: {
        fontSize: 13,
        ...Typography.default('semiBold'),
        marginBottom: 4,
    },
    offlineHelpText: {
        fontSize: 12,
        lineHeight: 18,
        ...Typography.default(),
    },
}));

// Bottom sheet styles
const sheetStyles = {
    iosContainer: {
        flex: 1,
    } as const,
    handleRow: {
        alignItems: 'center' as const,
        paddingTop: 10,
        paddingBottom: 6,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        opacity: 0.3,
    },
    overlay: {
        flex: 1,
        justifyContent: 'flex-end' as const,
    },
    backdrop: {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'black',
        opacity: 0.4,
    },
    sheet: {
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '70%' as const,
    },
};

// Picker styles
const pickerStyles = {
    container: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    } as const,
    title: {
        fontSize: 18,
        paddingVertical: 12,
        paddingHorizontal: 4,
        ...Typography.default('semiBold'),
    } as const,
    titleRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        justifyContent: 'space-between' as const,
    },
    doneButtonPressable: {
        width: 44,
        height: 44,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    },
    doneButtonGlass: {
        width: 40,
        height: 36,
        borderRadius: 18,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        overflow: 'hidden' as const,
        borderWidth: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    searchRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        marginBottom: 8,
    },
    searchInput: {
        flex: 1,
        minWidth: 0,
        fontSize: 15,
        padding: 0,
        ...Typography.default(),
    } as const,
    pathInputRow: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 10,
        paddingHorizontal: 12,
        minHeight: 46,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
    },
    pathInputField: {
        flex: 1,
        minWidth: 0,
    } as const,
    pathTextInput: {
        fontSize: 16,
        minHeight: 44,
        paddingVertical: 0,
        ...Typography.default(),
        ...Platform.select({ android: { textAlignVertical: 'center' as const }, default: {} }),
    } as const,
    pathMetaText: {
        fontSize: 13,
        paddingHorizontal: 4,
        paddingBottom: 8,
        ...Typography.default(),
    } as const,
    sectionLabel: {
        fontSize: 13,
        paddingHorizontal: 4,
        paddingBottom: 8,
        ...Typography.default('semiBold'),
    } as const,
    option: {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
    },
    optionPressed: {
        opacity: 0.6,
    } as const,
    optionText: {
        minWidth: 0,
        flexShrink: 1,
        fontSize: 15,
        ...Typography.default(),
    } as const,
    divider: {
        height: 1,
        marginHorizontal: 12,
        marginVertical: 4,
    } as const,
    optionList: {
        flexGrow: 0,
        flexShrink: 1,
    } as const,
    emptyText: {
        fontSize: 14,
        textAlign: 'center' as const,
        paddingVertical: 20,
        ...Typography.default(),
    } as const,
};

export default React.memo(NewSessionScreen);
