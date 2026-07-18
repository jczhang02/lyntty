import * as React from 'react';
import { Text, View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { getToolViewComponent } from './views/_all';
import { Message, ToolCall } from '@/sync/typesMessage';
import { CodeView } from '../CodeView';
import { ToolSectionView } from './ToolSectionView';
import { useElapsedTime } from '@/hooks/useElapsedTime';
import { ToolError } from './ToolError';
import { knownTools } from '@/components/tools/knownTools';
import { Metadata } from '@/sync/storageTypes';
import { useRouter } from 'expo-router';
import { PermissionFooter } from './PermissionFooter';
import { parseToolUseError } from '@/utils/toolErrorParser';
import { formatMCPTitle } from './views/MCPToolView';
import { t } from '@/text';
import { getToolDisplayName, getToolStateText, getToolSummaryCategory, getToolSummaryDetail, ToolSummaryCategory } from '@/utils/toolDisplay';
import { canControlSession } from '@/sync/sessionControlPolicy';

interface ToolViewProps {
    metadata: Metadata | null;
    tool: ToolCall;
    messages?: Message[];
    onPress?: () => void;
    sessionId?: string;
    messageId?: string;
}

export const ToolView = React.memo<ToolViewProps>((props) => {
    const { tool, onPress, sessionId, messageId } = props;
    const router = useRouter();
    const { theme } = useUnistyles();

    // For file-editing tools, navigate to file route instead of message detail
    const fileEditTools = ['Edit', 'MultiEdit', 'Write'];
    const isFileEditTool = fileEditTools.includes(tool.name);
    const filePath = isFileEditTool && typeof tool.input?.file_path === 'string' ? tool.input.file_path : null;

    // Create default onPress handler for navigation
    const handlePress = React.useCallback(() => {
        if (onPress) {
            onPress();
        } else if (sessionId && filePath) {
            router.push(`/session/${sessionId}/file?path=${btoa(filePath)}`);
        } else if (sessionId && messageId) {
            router.push(`/session/${sessionId}/message/${messageId}`);
        }
    }, [onPress, sessionId, messageId, filePath, router]);

    // Enable pressable if either onPress is provided or we have navigation params
    const isPressable = !!(onPress || (sessionId && filePath) || (sessionId && messageId));

    const knownTool = knownTools[tool.name as keyof typeof knownTools] as any;
    const SpecificToolView = getToolViewComponent(tool.name);

    // Inherited internal tools (for example ToolSearch) stay hidden in history.
    if (knownTool?.hidden) {
        return null;
    }

    let description: string | null = null;
    let status: string | null = null;
    let minimal = false;
    let icon = <Ionicons name="construct-outline" size={18} color={theme.colors.textSecondary} />;
    let noStatus = false;
    let hideDefaultError = false;

    // Unknown provider tools should render as compact cards, not raw JSON.
    // Pi can expose dynamic built-in/extension tools (for example get_goal or
    // custom project tools), and their large structured outputs must stay folded.
    const isPi = props.metadata?.flavor === 'pi';
    if (!knownTool && !SpecificToolView && isPi) {
        minimal = true;
    }

    // Extract status first to potentially use as title
    if (knownTool && typeof knownTool.extractStatus === 'function') {
        const state = knownTool.extractStatus({ tool, metadata: props.metadata });
        if (typeof state === 'string' && state) {
            status = state;
        }
    }

    // Handle optional title and function type
    let toolTitle = getToolDisplayName(tool.name);

    // Special handling for MCP tools
    if (tool.name.startsWith('mcp__')) {
        toolTitle = formatMCPTitle(tool.name);
        icon = <Ionicons name="extension-puzzle-outline" size={18} color={theme.colors.textSecondary} />;
        minimal = true;
    } else if (knownTool?.title) {
        if (typeof knownTool.title === 'function') {
            toolTitle = knownTool.title({ tool, metadata: props.metadata });
        } else {
            toolTitle = knownTool.title;
        }
    }

    if (knownTool && typeof knownTool.extractSubtitle === 'function') {
        const subtitle = knownTool.extractSubtitle({ tool, metadata: props.metadata });
        if (typeof subtitle === 'string' && subtitle) {
            description = subtitle;
        }
    }
    if (knownTool && knownTool.minimal !== undefined) {
        if (typeof knownTool.minimal === 'function') {
            minimal = knownTool.minimal({ tool, metadata: props.metadata, messages: props.messages });
        } else {
            minimal = knownTool.minimal;
        }
    }

    const category = getToolSummaryCategory(tool.name);

    // Read-only compatibility for historical parsed command records.
    if (tool.name === 'CodexBash' && tool.input?.parsed_cmd && Array.isArray(tool.input.parsed_cmd) && tool.input.parsed_cmd.length > 0) {
        const parsedCmd = tool.input.parsed_cmd[0];
        if (parsedCmd.type === 'read') {
            icon = <Octicons name="eye" size={18} color={theme.colors.text} />;
        } else if (parsedCmd.type === 'write') {
            icon = <Octicons name="file-diff" size={18} color={theme.colors.text} />;
        } else {
            icon = <Octicons name="terminal" size={18} color={theme.colors.text} />;
        }
    } else if (knownTool && typeof knownTool.icon === 'function') {
        icon = knownTool.icon(18, theme.colors.text);
    } else {
        icon = <ToolCategoryIcon category={category} size={18} color={theme.colors.textSecondary} />;
    }

    if (knownTool && typeof knownTool.noStatus === 'boolean') {
        noStatus = knownTool.noStatus;
    }
    if (knownTool && typeof knownTool.hideDefaultError === 'boolean') {
        hideDefaultError = knownTool.hideDefaultError;
    }

    let statusIcon = null;

    let isToolUseError = false;
    if (tool.state === 'error' && tool.result && parseToolUseError(tool.result).isToolUseError) {
        isToolUseError = true;
        console.log('isToolUseError', tool.result);
    }

    // Check permission status first for denied/canceled states
    if (tool.permission && (tool.permission.status === 'denied' || tool.permission.status === 'canceled')) {
        statusIcon = <Ionicons name="remove-circle-outline" size={20} color={theme.colors.textSecondary} />;
    } else if (isToolUseError) {
        statusIcon = <Ionicons name="remove-circle-outline" size={20} color={theme.colors.textSecondary} />;
        hideDefaultError = true;
        minimal = true;
    } else {
        switch (tool.state) {
            case 'running':
                if (!noStatus) {
                    statusIcon = <ActivityIndicator size="small" color={theme.colors.text} style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }} />;
                }
                break;
            case 'completed':
                // if (!noStatus) {
                //     statusIcon = <Ionicons name="checkmark-circle" size={20} color="#34C759" />;
                // }
                break;
            case 'error':
                statusIcon = <Ionicons name="alert-circle-outline" size={20} color={theme.colors.warning} />;
                break;
        }
    }

    const summaryDetail = getToolSummaryDetail(tool);
    const presentationStatus = status || (noStatus ? null : getToolStateText(tool));
    const needsInlineAction = tool.name === 'AskUserQuestion' || tool.permission?.status === 'pending';
    const isCompactTool = tool.name !== 'file' && !needsInlineAction;
    const renderPermissionFooter = () => (
        tool.permission
        && sessionId
        && tool.name !== 'AskUserQuestion'
        && canControlSession(props.metadata)
            ? <PermissionFooter permission={tool.permission} sessionId={sessionId} toolName={tool.name} toolInput={tool.input} metadata={props.metadata} />
            : null
    );

    const renderHeaderContent = () => {
        if (isCompactTool) {
            return (
                <View style={styles.compactHeaderLeft}>
                    <View style={styles.compactIconContainer}>
                        {icon}
                    </View>
                    <Text style={styles.compactToolName} numberOfLines={1}>{toolTitle}</Text>
                    {presentationStatus ? <Text style={styles.compactStatus} numberOfLines={1}>{presentationStatus}</Text> : null}
                    {summaryDetail ? (
                        <Text style={styles.compactCommandText} numberOfLines={1}>
                            {summaryDetail}
                        </Text>
                    ) : null}
                    {tool.state === 'running' && (
                        <View style={styles.elapsedContainer}>
                            <ElapsedView from={tool.createdAt} />
                        </View>
                    )}
                    {statusIcon}
                </View>
            );
        }

        return (
            <View style={styles.headerLeft}>
                <View style={styles.iconContainer}>
                    {icon}
                </View>
                <View style={styles.titleContainer}>
                    <Text style={styles.toolName} numberOfLines={1}>{toolTitle}{presentationStatus ? <Text style={styles.status}>{` ${presentationStatus}`}</Text> : null}</Text>
                    {description && (
                        <Text style={styles.toolDescription} numberOfLines={1}>
                            {description}
                        </Text>
                    )}
                </View>
                {tool.state === 'running' && (
                    <View style={styles.elapsedContainer}>
                        <ElapsedView from={tool.createdAt} />
                    </View>
                )}
                {statusIcon}
            </View>
        );
    };

    return (
        <View style={isCompactTool ? styles.compactContainer : styles.container}>
            {isPressable ? (
                <TouchableOpacity style={isCompactTool ? styles.compactHeader : styles.header} onPress={handlePress} activeOpacity={0.8}>
                    {renderHeaderContent()}
                </TouchableOpacity>
            ) : (
                <View style={isCompactTool ? styles.compactHeader : styles.header}>
                    {renderHeaderContent()}
                </View>
            )}

            {/* Content area - either custom children or tool-specific view */}
            {(() => {
                // Check if minimal first - minimal tools don't show content
                if (minimal || isCompactTool) {
                    return null;
                }

                // Try to use a specific tool view component first
                if (SpecificToolView) {
                    return (
                        <View style={styles.content}>
                            <SpecificToolView
                                tool={tool}
                                metadata={props.metadata}
                                messages={props.messages ?? []}
                                sessionId={sessionId}
                            />
                            {tool.state === 'error' && tool.result &&
                                !(tool.permission && (tool.permission.status === 'denied' || tool.permission.status === 'canceled')) &&
                                !hideDefaultError && (
                                    <ToolError message={String(tool.result)} />
                                )}
                        </View>
                    );
                }

                // Show error state if present (but not for denied/canceled permissions and not when hideDefaultError is true)
                if (tool.state === 'error' && tool.result &&
                    !(tool.permission && (tool.permission.status === 'denied' || tool.permission.status === 'canceled')) &&
                    !isToolUseError) {
                    return (
                        <View style={styles.content}>
                            <ToolError message={String(tool.result)} />
                        </View>
                    );
                }

                // Fall back to default view
                return (
                    <View style={styles.content}>
                        {/* Default content when no custom view available */}
                        {tool.input && (
                            <ToolSectionView title={t('toolView.input')}>
                                <CodeView code={JSON.stringify(tool.input, null, 2)} />
                            </ToolSectionView>
                        )}

                        {tool.state === 'completed' && tool.result && (
                            <ToolSectionView title={t('toolView.output')}>
                                <CodeView
                                    code={typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                                />
                            </ToolSectionView>
                        )}
                    </View>
                );
            })()}

            {/* Permission footer - always renders when permission exists to maintain consistent height */}
            {/* AskUserQuestion has its own Submit button UI - no permission footer needed */}
            {renderPermissionFooter()}
        </View>
    );
});

function ToolCategoryIcon(props: { category: ToolSummaryCategory; size: number; color: string }) {
    const { category, size, color } = props;
    switch (category) {
        case 'terminal':
            return <Octicons name="terminal" size={size} color={color} />;
        case 'edit':
            return <Octicons name="file-diff" size={size} color={color} />;
        case 'read':
            return <Octicons name="eye" size={size} color={color} />;
        case 'search':
            return <Octicons name="search" size={size} color={color} />;
        case 'web':
            return <Ionicons name="globe-outline" size={size} color={color} />;
        case 'task':
            return <Octicons name="rocket" size={size} color={color} />;
        default:
            return <Ionicons name="construct-outline" size={size} color={color} />;
    }
}

function ElapsedView(props: { from: number }) {
    const { from } = props;
    const elapsed = useElapsedTime(from);
    return <Text style={styles.elapsedText}>{elapsed.toFixed(1)}s</Text>;
}

const styles = StyleSheet.create((theme) => ({
    container: {
        backgroundColor: theme.colors.surfaceHigh,
        borderRadius: 8,
        marginVertical: 4,
        overflow: 'hidden'
    },
    compactContainer: {
        backgroundColor: 'transparent',
        marginVertical: 1,
        overflow: 'visible',
    },
    inlineContainer: {
        backgroundColor: 'transparent',
        marginVertical: 1,
        overflow: 'visible',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        backgroundColor: theme.colors.surfaceHighest,
    },
    compactHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 28,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
        backgroundColor: 'transparent',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    iconContainer: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
    },
    compactIconContainer: {
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleContainer: {
        flex: 1,
    },
    elapsedContainer: {
        marginLeft: 8,
    },
    elapsedText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    toolName: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    compactToolName: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '500',
        color: theme.colors.text,
        flexShrink: 0,
        maxWidth: 150,
    },
    compactStatus: {
        fontSize: 12,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        flexShrink: 0,
    },
    compactCommandText: {
        flex: 1,
        minWidth: 0,
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    status: {
        fontWeight: '400',
        opacity: 0.3,
        fontSize: 15,
    },
    toolDescription: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    content: {
        paddingHorizontal: 12,
        paddingTop: 8,
        overflow: 'visible'
    },
}));
