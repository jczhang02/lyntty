import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { useUnistyles } from 'react-native-unistyles';
import { useUpdates } from '@/hooks/useUpdates';
import { useChangelog } from '@/hooks/useChangelog';
import { useNativeUpdate } from '@/hooks/useNativeUpdate';
import { useRouter } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { installAndroidApkUpdate, openAndroidUnknownSourcesSettings } from '@/utils/androidApkUpdate';
import { t } from '@/text';

function messageFromUnknown(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export const UpdateBanner = React.memo(() => {
    const { theme } = useUnistyles();
    const { updateAvailable, reloadApp } = useUpdates();
    const { hasUnread, markAsRead } = useChangelog();
    const nativeUpdate = useNativeUpdate();
    const [installingNativeUpdate, setInstallingNativeUpdate] = React.useState(false);
    const router = useRouter();

    // Show native app update banner (highest priority)
    if (nativeUpdate?.available && nativeUpdate.updateUrl) {
        const updateUrl = nativeUpdate.updateUrl;
        const handleNativeUpdate = async () => {
            if (Platform.OS !== 'android') {
                await openExternalUrl(updateUrl);
                return;
            }

            if (!nativeUpdate.sha256) {
                Alert.alert(
                    'Update blocked',
                    'Release manifest is missing SHA-256. Open the GitHub Release instead.',
                    [
                        { text: 'Open GitHub', onPress: () => void openExternalUrl(updateUrl) },
                        { text: 'OK', style: 'cancel' },
                    ]
                );
                return;
            }

            setInstallingNativeUpdate(true);
            try {
                await installAndroidApkUpdate({
                    updateUrl,
                    sha256: nativeUpdate.sha256,
                    versionCode: nativeUpdate.versionCode,
                });
            } catch (error) {
                Alert.alert(
                    'Update failed',
                    `${messageFromUnknown(error)}\n\nIf Android blocks installs from this app, open install settings, allow Lyntty, then retry.`,
                    [
                        { text: 'Install settings', onPress: () => void openAndroidUnknownSourcesSettings() },
                        { text: 'Open GitHub', onPress: () => void openExternalUrl(updateUrl) },
                        { text: 'OK', style: 'cancel' },
                    ]
                );
            } finally {
                setInstallingNativeUpdate(false);
            }
        };

        return (
            <ItemGroup>
                <Item
                    title={nativeUpdate.versionName ? `${t('updateBanner.nativeUpdateAvailable')} ${nativeUpdate.versionName}` : t('updateBanner.nativeUpdateAvailable')}
                    subtitle={installingNativeUpdate ? 'Downloading and verifying APK…' : (Platform.OS === 'ios' ? t('updateBanner.tapToUpdateAppStore') : 'Tap to download, verify, and install APK')}
                    icon={<Ionicons name="download-outline" size={28} color={theme.colors.success} />}
                    showChevron={true}
                    onPress={installingNativeUpdate ? undefined : handleNativeUpdate}
                />
            </ItemGroup>
        );
    }

    // Show OTA update banner if available (second priority)
    if (updateAvailable) {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.updateAvailable')}
                    subtitle={t('updateBanner.pressToApply')}
                    icon={<Ionicons name="download-outline" size={28} color={theme.colors.success} />}
                    showChevron={false}
                    onPress={reloadApp}
                />
            </ItemGroup>
        );
    }

    // Show changelog banner if there are unread changelog entries (lowest priority)
    if (hasUnread) {
        return (
            <ItemGroup>
                <Item
                    title={t('updateBanner.whatsNew')}
                    subtitle={t('updateBanner.seeLatest')}
                    icon={<Ionicons name="sparkles-outline" size={28} color={theme.colors.text} />}
                    showChevron={true}
                    onPress={() => {
                        router.push('/changelog');
                        setTimeout(() => {
                            markAsRead();
                        }, 1000);
                    }}
                />
            </ItemGroup>
        );
    }

    return null;
});
