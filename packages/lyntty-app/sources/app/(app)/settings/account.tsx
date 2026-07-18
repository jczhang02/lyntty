import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { Typography } from '@/constants/Typography';
import { formatSecretKeyForBackup } from '@/auth/secretKeyBackup';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { Modal } from '@/modal';
import { t } from '@/text';
import { layout } from '@/components/layout';

import { useUnistyles } from 'react-native-unistyles';
import { useConnectAccount } from '@/hooks/useConnectAccount';
import {
    getPushPermissionInfo,
    requestPushPermissionOrOpenSettings,
    syncCurrentPushToken,
    type PushPermissionInfo,
} from '@/sync/pushRegistration';

function formatPushPermissionLabel(permission: PushPermissionInfo | null): string {
    if (!permission) {
        return 'Loading';
    }
    if (permission.granted) {
        return 'Allowed';
    }
    if (permission.status === 'denied') {
        return 'Denied';
    }
    return 'Not requested';
}

function formatPushPermissionSubtitle(permission: PushPermissionInfo | null): string {
    if (!permission) {
        return 'Checking push notification permissions for this device.';
    }
    if (permission.granted) {
        return 'This device can receive push notifications.';
    }
    if (permission.canAskAgain) {
        return 'The system prompt can still be shown again from the app.';
    }
    return 'iOS has stopped prompting. Open system settings to enable notifications again.';
}

export default React.memo(() => {
    const { theme } = useUnistyles();
    const auth = useAuth();
    const [showSecret, setShowSecret] = useState(false);
    const [copiedRecently, setCopiedRecently] = useState(false);
    const { connectAccount, isLoading: isConnecting } = useConnectAccount();
    const [pushPermission, setPushPermission] = useState<PushPermissionInfo | null>(null);
    const [loadingPushSettings, setLoadingPushSettings] = useState(false);
    const [requestingPushPermission, setRequestingPushPermission] = useState(false);

    // Get the current secret key
    const currentSecret = auth.credentials?.secret || '';
    const formattedSecret = currentSecret ? formatSecretKeyForBackup(currentSecret) : '';

    const loadPushSettings = useCallback(async (showError = false) => {
        setLoadingPushSettings(true);
        try {
            setPushPermission(await getPushPermissionInfo());
        } catch (error) {
            console.error('Failed to load push notification settings:', error);
            if (showError) {
                Modal.alert(t('common.error'), t('appWide.failedToLoadPushNotificationSettings'));
            }
        } finally {
            setLoadingPushSettings(false);
        }
    }, []);

    useEffect(() => {
        void loadPushSettings();
    }, [loadPushSettings]);

    useFocusEffect(
        useCallback(() => {
            void loadPushSettings();
        }, [loadPushSettings])
    );

    const handleShowSecret = () => {
        setShowSecret(!showSecret);
    };

    const handleCopySecret = async () => {
        try {
            await Clipboard.setStringAsync(formattedSecret);
            setCopiedRecently(true);
            setTimeout(() => setCopiedRecently(false), 2000);
            Modal.alert(t('common.success'), t('settingsAccount.secretKeyCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('settingsAccount.secretKeyCopyFailed'));
        }
    };

    const handleLogout = async () => {
        const confirmed = await Modal.confirm(
            t('common.logout'),
            t('settingsAccount.logoutConfirm'),
            { confirmText: t('common.logout'), destructive: true }
        );
        if (confirmed) {
            auth.logout();
        }
    };

    const handlePushPermissionRequest = useCallback(async () => {
        if (!auth.credentials) {
            return;
        }

        setRequestingPushPermission(true);
        try {
            const result = await requestPushPermissionOrOpenSettings();
            setPushPermission(result.permission);

            if (result.granted) {
                await syncCurrentPushToken(auth.credentials);
                await loadPushSettings();
                Modal.alert(t('common.success'), t('appWide.pushNotificationsAreEnabledForThisDevice'));
                return;
            }

            await loadPushSettings();

            if (result.openedSettings) {
                Modal.alert(t('appWide.openSettings'), t('appWide.theSystemWillNotShowThePermissionPromptAgain'));
                return;
            }

            Modal.alert(t('common.error'), t('appWide.pushNotificationPermissionWasNotGranted'));
        } catch (error) {
            console.error('Failed to request push permission:', error);
            Modal.alert(t('common.error'), t('appWide.failedToRequestPushNotificationPermission'));
        } finally {
            setRequestingPushPermission(false);
        }
    }, [auth.credentials, loadPushSettings]);

    return (
        <>
            <ItemList>
                {/* Account Info */}
                <ItemGroup title={t('settingsAccount.accountInformation')}>
                    <Item
                        title={t('settingsAccount.status')}
                        detail={auth.isAuthenticated ? t('settingsAccount.statusActive') : t('settingsAccount.statusNotAuthenticated')}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsAccount.linkNewDevice')}
                        subtitle={isConnecting ? t('common.scanning') : t('settingsAccount.linkNewDeviceSubtitle')}
                        icon={<Ionicons name="qr-code-outline" size={29} color="#007AFF" />}
                        onPress={connectAccount}
                        disabled={isConnecting}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Backup Section */}
                <ItemGroup
                    title={t('settingsAccount.backup')}
                    footer={t('settingsAccount.backupDescription')}
                >
                    <Item
                        title={t('settingsAccount.secretKey')}
                        subtitle={showSecret ? t('settingsAccount.tapToHide') : t('settingsAccount.tapToReveal')}
                        icon={<Ionicons name={showSecret ? "eye-off-outline" : "eye-outline"} size={29} color="#FF9500" />}
                        onPress={handleShowSecret}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Secret Key Display */}
                {showSecret && (
                    <ItemGroup>
                        <Pressable onPress={handleCopySecret}>
                            <View style={{
                                backgroundColor: theme.colors.surface,
                                paddingHorizontal: 16,
                                paddingVertical: 14,
                                width: '100%',
                                maxWidth: layout.maxWidth,
                                alignSelf: 'center'
                            }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <Text style={{
                                        fontSize: 11,
                                        color: theme.colors.textSecondary,
                                        letterSpacing: 0.5,
                                        textTransform: 'uppercase',
                                        ...Typography.default('semiBold')
                                    }}>
                                        {t('settingsAccount.secretKeyLabel')}
                                    </Text>
                                    <Ionicons
                                        name={copiedRecently ? "checkmark-circle" : "copy-outline"}
                                        size={18}
                                        color={copiedRecently ? "#34C759" : theme.colors.textSecondary}
                                    />
                                </View>
                                <Text style={{
                                    fontSize: 13,
                                    letterSpacing: 0.5,
                                    lineHeight: 20,
                                    color: theme.colors.text,
                                    ...Typography.mono()
                                }}>
                                    {formattedSecret}
                                </Text>
                            </View>
                        </Pressable>
                    </ItemGroup>
                )}

                <ItemGroup
                    title={t('appWide.pushNotifications')}
                >
                    <Item
                        title={t('appWide.permission')}
                        detail={formatPushPermissionLabel(pushPermission)}
                        subtitle={formatPushPermissionSubtitle(pushPermission)}
                        icon={<Ionicons name="notifications-outline" size={29} color="#007AFF" />}
                        loading={loadingPushSettings}
                        showChevron={false}
                    />
                    <Item
                        title={t('appWide.requestPermissionAgain')}
                        subtitle={pushPermission?.canAskAgain
                            ? t('appWide.showsTheSystemPromptAgainIfIosStillAllows')
                            : t('appWide.opensSystemSettingsWhenIosWillNotPromptAgain')}
                        icon={<Ionicons name="shield-checkmark-outline" size={29} color="#34C759" />}
                        onPress={handlePushPermissionRequest}
                        loading={requestingPushPermission}
                        disabled={requestingPushPermission || loadingPushSettings || !auth.credentials}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Danger Zone */}
                <ItemGroup title={t('settingsAccount.dangerZone')}>
                    <Item
                        title={t('settingsAccount.logout')}
                        subtitle={t('settingsAccount.logoutSubtitle')}
                        icon={<Ionicons name="log-out-outline" size={29} color="#FF3B30" />}
                        destructive
                        onPress={handleLogout}
                    />
                </ItemGroup>
            </ItemList>
        </>
    );
});
