import React, { useState } from 'react';
import { ActivityIndicator, Platform, Text, TouchableOpacity, View } from 'react-native';
import { sessionAllow, sessionDeny } from '@/sync/ops';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';
import type { Metadata } from '@/sync/storageTypes';
import { canControlSession } from '@/sync/sessionControlPolicy';

interface PermissionFooterProps {
    permission: {
        id: string;
        status: 'pending' | 'approved' | 'denied' | 'canceled';
    };
    sessionId: string;
    toolName: string;
    toolInput?: unknown;
    metadata?: Metadata | null;
}

export const PermissionFooter: React.FC<PermissionFooterProps> = ({ permission, sessionId, metadata }) => {
    const { theme } = useUnistyles();
    const [loading, setLoading] = useState<'allow' | 'deny' | null>(null);
    const pending = permission.status === 'pending';
    const approved = permission.status === 'approved';
    const denied = permission.status === 'denied' || permission.status === 'canceled';
    const controllable = canControlSession(metadata);

    const decide = async (decision: 'allow' | 'deny') => {
        if (!controllable || !pending || loading) return;
        setLoading(decision);
        try {
            if (decision === 'allow') {
                await sessionAllow(sessionId, permission.id);
            } else {
                await sessionDeny(sessionId, permission.id);
            }
        } catch (error) {
            console.error(`Failed to ${decision} permission:`, error);
        } finally {
            setLoading(null);
        }
    };

    const renderButton = (decision: 'allow' | 'deny', selected: boolean, label: string) => (
        <TouchableOpacity
            style={[styles.button, selected && styles.buttonSelected, !pending && !selected && styles.buttonInactive]}
            onPress={() => void decide(decision)}
            disabled={!controllable || !pending || loading !== null}
            activeOpacity={controllable && pending ? 0.7 : 1}
        >
            {loading === decision && pending ? (
                <ActivityIndicator
                    size={Platform.OS === 'ios' ? 'small' : 14 as any}
                    color={theme.colors.text}
                />
            ) : (
                <Text style={[styles.buttonText, selected && styles.buttonTextSelected]}>{label}</Text>
            )}
        </TouchableOpacity>
    );

    if (!controllable) return null;

    return (
        <View style={styles.container}>
            <View style={styles.buttonContainer}>
                {renderButton('allow', approved, t('common.yes'))}
                {renderButton('deny', denied, t('common.no'))}
            </View>
        </View>
    );
};

const styles = StyleSheet.create((theme) => ({
    container: {
        paddingHorizontal: 4,
        paddingTop: 2,
        paddingBottom: 6,
        justifyContent: 'center',
    },
    buttonContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
    },
    button: {
        minWidth: 64,
        minHeight: 28,
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: theme.colors.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.72,
    },
    buttonSelected: {
        opacity: 1,
        backgroundColor: theme.colors.surfaceHigh,
    },
    buttonInactive: {
        opacity: 0.45,
    },
    buttonText: {
        color: theme.colors.text,
        fontSize: 13,
        fontWeight: '400',
    },
    buttonTextSelected: {
        fontWeight: '600',
    },
}));
