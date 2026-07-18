import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Item } from './Item';
import { ItemGroup } from './ItemGroup';
import { useUnistyles } from 'react-native-unistyles';
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
                    t('appWide.updateBlocked'),
                    t('appWide.releaseManifestIsMissingSha256OpenTheGithub'),
                    [
                        { text: t('appWide.openGithub'), onPress: () => void openExternalUrl(updateUrl) },
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
                    t('appWide.updateFailed'),
                    t('appWide.valueIfAndroidBlocksInstallsFromThisAppOpen', { value0: messageFromUnknown(error) }),
                    [
                        { text: t('appWide.installSettings'), onPress: () => void openAndroidUnknownSourcesSettings() },
                        { text: t('appWide.openGithub'), onPress: () => void openExternalUrl(updateUrl) },
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
                    subtitle={installingNativeUpdate ? t('appWide.downloadingAndVerifyingApk') : (Platform.OS === 'ios' ? t('updateBanner.tapToUpdateAppStore') : t('appWide.tapToDownloadVerifyAndInstallApk'))}
                    icon={<Ionicons name="download-outline" size={28} color={theme.colors.success} />}
                    showChevron={true}
                    onPress={installingNativeUpdate ? undefined : handleNativeUpdate}
                />
            </ItemGroup>
        );
    }

    // Show changelog after the full-APK update check.
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
