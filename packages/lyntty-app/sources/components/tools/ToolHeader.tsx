import * as React from 'react';
import { Text, View } from 'react-native';
import { Ionicons, Octicons } from '@expo/vector-icons';
import { ToolCall } from '@/sync/typesMessage';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { getToolDisplayName, getToolSummaryCategory, getToolSummaryDetail, ToolSummaryCategory } from '@/utils/toolDisplay';

interface ToolHeaderProps {
    tool: ToolCall;
}

export function ToolHeader({ tool }: ToolHeaderProps) {
    const { theme } = useUnistyles();
    const toolTitle = getToolDisplayName(tool.name);
    const category = getToolSummaryCategory(tool.name);
    const subtitle = getToolSummaryDetail(tool);
    const icon = <ToolHeaderIcon category={category} size={18} color={theme.colors.header.tint} />;

    return (
        <View style={styles.container}>
            <View style={styles.titleContainer}>
                <View style={styles.titleRow}>
                    {icon}
                    <Text style={styles.title} numberOfLines={1}>{toolTitle}</Text>
                </View>
                {subtitle && (
                    <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                )}
            </View>
        </View>
    );
}

function ToolHeaderIcon(props: { category: ToolSummaryCategory; size: number; color: string }) {
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

const styles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        flexGrow: 1,
        flexBasis: 0,
        paddingHorizontal: 4,
    },
    titleContainer: {
        flexDirection: 'column',
        alignItems: 'center',
        flexGrow: 1,
        flexBasis: 0
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    title: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 2,
    },
}));
