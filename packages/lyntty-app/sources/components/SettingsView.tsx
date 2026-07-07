import { View, ScrollView, Pressable, Platform } from 'react-native';
import * as React from 'react';
import { Text } from '@/components/StyledText';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useConnectTerminal } from '@/hooks/useConnectTerminal';
import { useLocalSettingMutable } from '@/sync/storage';
import { trackWhatsNewClicked } from '@/track';
import { Modal } from '@/modal';
import { useMultiClick } from '@/hooks/useMultiClick';
import { useAllMachines } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { useProfile } from '@/sync/storage';
import { getDisplayName, getAvatarUrl, getBio } from '@/sync/profile';
import { Avatar } from '@/components/Avatar';
import { t } from '@/text';
import { getServerUrl } from '@/sync/serverConfig';
import { formatSettingsNodeSubtitle, formatSettingsServerSubtitle } from './settingsOverview';

function formatAppVersion(): string {
    const nativeVersion = Application.nativeApplicationVersion;
    const nativeBuildVersion = Application.nativeBuildVersion;
    if (nativeVersion && nativeBuildVersion) {
        return `${nativeVersion} (${nativeBuildVersion})`;
    }
    if (nativeVersion) {
        return nativeVersion;
    }
    return Constants.expoConfig?.version || '1.0.0';
}

export const SettingsView = React.memo(function SettingsView() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const appVersion = formatAppVersion();
    const [devModeEnabled, setDevModeEnabled] = useLocalSettingMutable('devModeEnabled');
    const [showOfflineMachines, setShowOfflineMachines] = React.useState(false);
    const allMachinesWithOffline = useAllMachines({ includeOffline: true });
    const onlineMachineCount = React.useMemo(
        () => allMachinesWithOffline.filter(isMachineOnline).length,
        [allMachinesWithOffline]
    );
    const offlineMachineCount = allMachinesWithOffline.length - onlineMachineCount;
    const visibleMachines = React.useMemo(
        () => showOfflineMachines
            ? allMachinesWithOffline
            : allMachinesWithOffline.filter(isMachineOnline),
        [allMachinesWithOffline, showOfflineMachines]
    );
    const profile = useProfile();
    const displayName = getDisplayName(profile);
    const avatarUrl = getAvatarUrl(profile);
    const bio = getBio(profile);
    const serverUrl = getServerUrl();
    const serverSubtitle = formatSettingsServerSubtitle(serverUrl);
    const nodeSubtitle = formatSettingsNodeSubtitle(onlineMachineCount, allMachinesWithOffline.length, {
        noNodesPaired: t('settings.noNodesPaired'),
        oneNodeOnline: t('settings.oneNodeOnline'),
        nodesOnline: (onlineCount, totalCount) => t('settings.nodesOnline', { onlineCount, totalCount }),
    });
    const accountSubtitle = bio || displayName || t('settings.signedIn');

    const { connectTerminal, connectWithUrl, isLoading } = useConnectTerminal();


    // Use the multi-click hook for version clicks
    const handleVersionClick = useMultiClick(() => {
        // Toggle dev mode
        const newDevMode = !devModeEnabled;
        setDevModeEnabled(newDevMode);
        Modal.alert(
            t('modals.developerMode'),
            newDevMode ? t('modals.developerModeEnabled') : t('modals.developerModeDisabled')
        );
    }, {
        requiredClicks: 10,
        resetTimeout: 2000
    });


    return (

        <ItemList style={{ paddingTop: 0 }}>
            {/* Compact app overview */}
            <ItemGroup>
                <Item
                    title={t('settings.relay')}
                    subtitle={serverSubtitle}
                    icon={<Ionicons name="cloud-outline" size={29} color="#007AFF" />}
                    onPress={() => router.push('/server')}
                />
                <Item
                    title={t('settings.account')}
                    subtitle={accountSubtitle}
                    icon={(
                        <Avatar
                            id={profile.id || 'lyntty-account'}
                            size={29}
                            imageUrl={avatarUrl}
                            thumbhash={profile.avatar?.thumbhash ?? undefined}
                        />
                    )}
                    onPress={() => router.push('/settings/account')}
                />
                <Item
                    title={t('settings.machines')}
                    subtitle={nodeSubtitle}
                    icon={<Ionicons name="desktop-outline" size={29} color={onlineMachineCount > 0 ? theme.colors.status.connected : theme.colors.status.disconnected} />}
                    showChevron={false}
                />
                <Item
                    title={t('common.version')}
                    subtitle={appVersion}
                    icon={<Ionicons name="information-circle-outline" size={29} color={theme.colors.textSecondary} />}
                    onPress={handleVersionClick}
                    showChevron={false}
                />
            </ItemGroup>

            {/* Connect Terminal - Only show on native platforms */}
            {Platform.OS !== 'web' && (
                <ItemGroup>
                    <Item
                        title={t('settings.scanQrCodeToAuthenticate')}
                        icon={<Ionicons name="qr-code-outline" size={29} color="#007AFF" />}
                        onPress={connectTerminal}
                        loading={isLoading}
                        showChevron={false}
                    />
                    <Item
                        title={t('connect.enterUrlManually')}
                        icon={<Ionicons name="link-outline" size={29} color="#007AFF" />}
                        onPress={async () => {
                            const url = await Modal.prompt(
                                t('modals.authenticateTerminal'),
                                t('modals.pasteUrlFromTerminal'),
                                {
                                    placeholder: 'lyntty://terminal?...',
                                    confirmText: t('common.authenticate')
                                }
                            );
                            if (url?.trim()) {
                                connectWithUrl(url.trim());
                            }
                        }}
                        showChevron={false}
                    />
                </ItemGroup>
            )}

            {/* Machines (sorted: online first, then last seen desc) */}
            {allMachinesWithOffline.length > 0 && (
                <ItemGroup title={t('settings.machines')}>
                    {visibleMachines.map((machine) => {
                        const isOnline = isMachineOnline(machine);
                        const host = machine.metadata?.host || 'Unknown';
                        const displayName = machine.metadata?.displayName;
                        const platform = machine.metadata?.platform || '';

                        // Use displayName if available, otherwise use host
                        const title = displayName || host;

                        // Build subtitle: show hostname if different from title, plus platform and status
                        let subtitle = '';
                        if (displayName && displayName !== host) {
                            subtitle = host;
                        }
                        if (platform) {
                            subtitle = subtitle ? `${subtitle} • ${platform}` : platform;
                        }
                        subtitle = subtitle ? `${subtitle} • ${isOnline ? t('status.online') : t('status.offline')}` : (isOnline ? t('status.online') : t('status.offline'));

                        return (
                            <Item
                                key={machine.id}
                                title={title}
                                subtitle={subtitle}
                                icon={
                                    <Ionicons
                                        name="desktop-outline"
                                        size={29}
                                        color={isOnline ? theme.colors.status.connected : theme.colors.status.disconnected}
                                    />
                                }
                                onPress={() => router.push(`/machine/${machine.id}`)}
                            />
                        );
                    })}
                    {offlineMachineCount > 0 && (
                        <Item
                            title={showOfflineMachines
                                ? t('settings.hideOfflineMachines')
                                : t('settings.showOfflineMachines', { count: offlineMachineCount })}
                            onPress={() => setShowOfflineMachines(v => !v)}
                            showChevron={false}
                            titleStyle={{
                                textAlign: 'center',
                                color: theme.colors.textLink,
                            }}
                        />
                    )}
                </ItemGroup>
            )}

            {/* Features */}
            <ItemGroup title={t('settings.features')}>
                <Item
                    title={t('settings.account')}
                    subtitle={t('settings.accountSubtitle')}
                    icon={<Ionicons name="person-circle-outline" size={29} color="#007AFF" />}
                    onPress={() => router.push('/settings/account')}
                />
                <Item
                    title={t('settings.appearance')}
                    subtitle={t('settings.appearanceSubtitle')}
                    icon={<Ionicons name="color-palette-outline" size={29} color="#5856D6" />}
                    onPress={() => router.push('/settings/appearance')}
                />
                <Item
                    title={t('settings.featuresTitle')}
                    subtitle={t('settings.featuresSubtitle')}
                    icon={<Ionicons name="flask-outline" size={29} color="#FF9500" />}
                    onPress={() => router.push('/settings/features')}
                />
            </ItemGroup>

            {/* About */}
            <ItemGroup title={t('settings.about')} footer={t('settings.aboutFooter')}>
                <Item
                    title={t('settings.whatsNew')}
                    subtitle={t('settings.whatsNewSubtitle')}
                    icon={<Ionicons name="sparkles-outline" size={29} color="#FF9500" />}
                    onPress={() => {
                        trackWhatsNewClicked();
                        router.push('/changelog');
                    }}
                />
            </ItemGroup>

        </ItemList>
    );
});
