import type { ReviewEvidenceSummary } from '@/sync/reviewEvidence';
import { Ionicons } from '@expo/vector-icons';
import * as React from 'react';
import { Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';

function StatPill({ label, value }: { label: string; value: string | number }) {
    const { theme } = useUnistyles();
    return (
        <View style={{
            minHeight: 32,
            borderRadius: 12,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: theme.colors.surfaceHigh,
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {value}
            </Text>
            <Text style={{ color: theme.colors.textSecondary, fontSize: 10, marginTop: 1 }}>
                {label}
            </Text>
        </View>
    );
}

function previewList(items: string[], empty: string): string {
    if (items.length === 0) return empty;
    const visible = items.slice(0, 2).join(', ');
    return items.length > 2 ? `${visible} +${items.length - 2}` : visible;
}

export function ReviewEvidencePanel({ evidence }: { evidence: ReviewEvidenceSummary }) {
    const { theme } = useUnistyles();
    if (!evidence.hasEvidence) return null;

    const accentColor = evidence.severity === 'error'
        ? theme.colors.textDestructive
        : evidence.severity === 'warning'
            ? theme.colors.warning
            : theme.colors.textLink;

    return (
        <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
            <View style={{
                borderRadius: 20,
                padding: 12,
                gap: 10,
                backgroundColor: theme.colors.surface,
                shadowColor: theme.colors.shadow.color,
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: theme.colors.shadow.opacity * 0.7,
                shadowRadius: 14,
                elevation: 2,
            }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{
                        width: 32,
                        height: 32,
                        borderRadius: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: `${accentColor}22`,
                    }}>
                        <Ionicons name="checkmark-done-outline" size={18} color={accentColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '700' }}>
                            Review Evidence
                        </Text>
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                            {previewList(evidence.changedFiles, 'No changed files yet')}
                        </Text>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <StatPill label="files" value={evidence.changedFiles.length} />
                    <StatPill label="checks" value={evidence.checks.length} />
                    <StatPill label="tools" value={evidence.toolCount} />
                    <StatPill label="errors" value={evidence.errors.length} />
                </View>

                {(evidence.checks.length > 0 || evidence.recoveryStates.length > 0) && (
                    <Text style={{ color: theme.colors.textSecondary, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>
                        {evidence.checks.length > 0 ? `Checks: ${previewList(evidence.checks, '')}` : ''}
                        {evidence.checks.length > 0 && evidence.recoveryStates.length > 0 ? ' · ' : ''}
                        {evidence.recoveryStates.length > 0 ? `Recovery: ${evidence.recoveryStates.join(', ')}` : ''}
                    </Text>
                )}
            </View>
        </View>
    );
}
