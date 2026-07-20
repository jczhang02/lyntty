import React, { useState } from 'react';
import { View, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Text } from '@/components/StyledText';
import { Typography } from '@/constants/Typography';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { RoundButton } from '@/components/RoundButton';
import { Modal } from '@/modal';
import { layout } from '@/components/layout';
import { t } from '@/text';
import {
    getConfiguredServerUrl,
    isPreviewAppEnvironment,
    isPreviewServerSetupRequired,
    setServerUrl,
    validateServerUrl,
} from '@/sync/serverConfig';
import { probeLynttyRelay, replaceServerUrlWithAuthBoundary } from '@/sync/serverConfigUtils';
import { getCurrentAuth } from '@/auth/AuthContext';
import { clearStoredAuthState } from '@/auth/bootstrapAuth';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const stylesheet = StyleSheet.create((theme) => ({
    keyboardAvoidingView: {
        flex: 1,
    },
    itemListContainer: {
        flex: 1,
    },
    contentContainer: {
        backgroundColor: theme.colors.surface,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: '100%',
        maxWidth: layout.maxWidth,
        alignSelf: 'center',
    },
    labelText: {
        ...Typography.default('semiBold'),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    textInput: {
        backgroundColor: theme.colors.input.background,
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
        ...Typography.mono(),
        fontSize: 14,
        color: theme.colors.input.text,
    },
    textInputValidating: {
        opacity: 0.6,
    },
    errorText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textDestructive,
        marginBottom: 12,
    },
    validatingText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.status.connecting,
        marginBottom: 12,
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    buttonWrapper: {
        flex: 1,
    },
    statusText: {
        ...Typography.default(),
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    setupText: {
        ...Typography.default(),
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        marginBottom: 16,
    },
}));

export default function ServerConfigScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const configuredServerUrl = getConfiguredServerUrl();
    const previewEnvironment = isPreviewAppEnvironment();
    const setupRequired = isPreviewServerSetupRequired();
    const [inputUrl, setInputUrl] = useState(configuredServerUrl ?? '');
    const [error, setError] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);

    const validateServer = async (url: string): Promise<boolean> => {
        try {
            setIsValidating(true);
            setError(null);

            const result = await probeLynttyRelay(url);
            if (result === 'server-error') {
                setError(t('server.serverReturnedError'));
                return false;
            }
            if (result === 'not-relay') {
                setError(t('server.notValidLynttyServer'));
                return false;
            }
            return true;
        } catch (err) {
            setError(t('server.failedToConnectToServer'));
            return false;
        } finally {
            setIsValidating(false);
        }
    };

    const handleSave = async () => {
        if (!inputUrl.trim()) {
            Modal.alert(t('common.error'), t('server.enterServerUrl'));
            return;
        }

        const validation = validateServerUrl(inputUrl);
        if (!validation.valid) {
            setError(validation.errorCode === 'preview-http-requires-local-network'
                ? t('server.previewHttpRequiresLocalNetwork')
                : validation.error || t('errors.invalidFormat'));
            return;
        }

        const normalizedUrl = inputUrl.trim();
        // Validate the server
        const isValid = await validateServer(normalizedUrl);
        if (!isValid) {
            return;
        }

        const confirmed = setupRequired || await Modal.confirm(
            t('server.changeServer'),
            t('server.continueWithServer'),
            { confirmText: t('common.continue'), destructive: true },
        );

        if (confirmed) {
            try {
                await replaceServerUrlWithAuthBoundary({
                    currentUrl: configuredServerUrl,
                    nextUrl: normalizedUrl,
                    clearAuth: async () => {
                        const auth = getCurrentAuth();
                        if (auth) await auth.logout({ skipPushUnregister: true });
                        else await clearStoredAuthState();
                    },
                    persistUrl: setServerUrl,
                });
                router.replace('/');
            } catch (saveError) {
                console.error('Failed to switch Relay safely:', saveError);
                setError(t('server.failedToClearOldAccount'));
            }
        }
    };

    const handleReset = async () => {
        const confirmed = await Modal.confirm(
            previewEnvironment ? t('server.clearRelay') : t('server.resetToDefault'),
            previewEnvironment ? t('server.clearRelayConfirm') : t('server.resetServerDefault'),
            { confirmText: t('common.reset'), destructive: true }
        );

        if (confirmed) {
            try {
                await replaceServerUrlWithAuthBoundary({
                    currentUrl: configuredServerUrl,
                    nextUrl: null,
                    clearAuth: async () => {
                        const auth = getCurrentAuth();
                        if (auth) await auth.logout({ skipPushUnregister: true });
                        else await clearStoredAuthState();
                    },
                    persistUrl: setServerUrl,
                    forceAuthClear: true,
                });
                setInputUrl('');
                router.replace('/server');
            } catch (resetError) {
                console.error('Failed to clear Relay safely:', resetError);
                setError(t('server.failedToClearOldAccount'));
            }
        }
    };

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: setupRequired ? t('server.previewSetupTitle') : t('server.serverConfiguration'),
                    headerBackTitle: t('common.back'),
                    headerBackVisible: !setupRequired,
                    gestureEnabled: !setupRequired,
                }}
            />

            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <ItemList style={styles.itemListContainer}>
                    <ItemGroup footer={previewEnvironment ? t('server.previewSetupFooter') : t('server.advancedFeatureFooter')}>
                        <View style={styles.contentContainer}>
                            {setupRequired && (
                                <Text style={styles.setupText}>{t('server.previewSetupDescription')}</Text>
                            )}
                            <Text style={styles.labelText}>{t('server.customServerUrlLabel').toUpperCase()}</Text>
                            <TextInput
                                testID="lyntty-server-url-input"
                                accessibilityLabel={t('appWide.lynttyServerUrl')}
                                style={[
                                    styles.textInput,
                                    isValidating && styles.textInputValidating
                                ]}
                                value={inputUrl}
                                onChangeText={(text) => {
                                    setInputUrl(text);
                                    setError(null);
                                }}
                                placeholder={t('common.urlPlaceholder')}
                                placeholderTextColor={theme.colors.input.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                                editable={!isValidating}
                            />
                            {error && (
                                <Text style={styles.errorText}>
                                    {error}
                                </Text>
                            )}
                            {isValidating && (
                                <Text style={styles.validatingText}>
                                    {t('server.validatingServer')}
                                </Text>
                            )}
                            <View style={styles.buttonRow}>
                                {!setupRequired && (configuredServerUrl || !previewEnvironment) && (
                                    <View style={styles.buttonWrapper}>
                                        <RoundButton
                                            testID="lyntty-server-reset"
                                            title={previewEnvironment ? t('server.clearRelay') : t('server.resetToDefault')}
                                            size="normal"
                                            display="inverted"
                                            onPress={handleReset}
                                        />
                                    </View>
                                )}
                                <View style={styles.buttonWrapper}>
                                    <RoundButton
                                        testID="lyntty-server-save"
                                        title={isValidating ? t('server.validating') : t('common.save')}
                                        size="normal"
                                        action={handleSave}
                                        disabled={isValidating}
                                    />
                                </View>
                            </View>
                            {configuredServerUrl && (
                                <Text style={styles.statusText}>
                                    {t('server.currentlyUsingCustomServer')}
                                </Text>
                            )}
                        </View>
                    </ItemGroup>

                    </ItemList>
            </KeyboardAvoidingView>
        </>
    );
}
