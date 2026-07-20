import 'react-native-quick-base64';
import * as React from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Fonts from 'expo-font';
import * as Notifications from 'expo-notifications';
import { FontAwesome } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { AuthCredentials } from '@/auth/tokenStorage';
import { AuthProvider } from '@/auth/AuthContext';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SidebarNavigator } from '@/components/SidebarNavigator';
import sodium from '@/encryption/libsodium.lib';
import { View, Platform, AppState } from 'react-native';
import { ModalProvider } from '@/modal';
import { bootstrapAuth } from '@/auth/bootstrapAuth';
import { isPreviewServerSetupRequired, subscribeServerConfig } from '@/sync/serverConfig';
import { StatusBarProvider } from '@/components/StatusBarProvider';
// import * as SystemUI from 'expo-system-ui';
import { initConsoleLogging, setConsoleOutputEnabled } from '@/utils/consoleLogging';
import { useLocalSetting } from '@/sync/storage';
import { useUnistyles } from 'react-native-unistyles';
import { AsyncLock } from '@/utils/lock';
import { getSessionRouteFromNotificationResponse } from '@/utils/notificationRouting';
import { navigateToSession } from '@/hooks/useNavigateToSession';

// Configure notification handler — suppress push display when app is in foreground
Notifications.setNotificationHandler({
    handleNotification: async () => {
        const isForeground = AppState.currentState === 'active';
        return {
            shouldShowAlert: !isForeground,
            shouldPlaySound: !isForeground,
            shouldSetBadge: true,
            shouldShowBanner: !isForeground,
            shouldShowList: true,
        };
    },
});

// Setup Android notification channels (required for Android 8.0+)
if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
    });
    Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
    });
}

export {
    // Catch any errors thrown by the Layout component.
    ErrorBoundary,
} from 'expo-router';

// Configure splash screen
SplashScreen.setOptions({
    fade: true,
    duration: 300,
})
SplashScreen.preventAutoHideAsync();

// Set window background color - now handled by Unistyles
// SystemUI.setBackgroundColorAsync('white');

// Remote logging to local log server (configured via Dev > Log Server setting)
initConsoleLogging()

// Component to apply horizontal safe area padding
function HorizontalSafeAreaWrapper({ children }: { children: React.ReactNode }) {
    const insets = useSafeAreaInsets();
    return (
        <View style={{
            flex: 1,
            paddingLeft: insets.left,
            paddingRight: insets.right
        }}>
            {children}
        </View>
    );
}

let lock = new AsyncLock();
let loaded = false;

function stringifyNotificationPayload(value: unknown): string {
    try {
        const serialized = JSON.stringify(value, null, 2);
        return serialized ?? String(value);
    } catch (error) {
        return `[unserializable notification payload: ${error instanceof Error ? error.message : 'Unknown error'}]`;
    }
}

async function loadFonts() {
    await lock.inLock(async () => {
        if (loaded) {
            return;
        }
        loaded = true;
        await Fonts.loadAsync({
            SpaceMono: require('@/assets/fonts/SpaceMono-Regular.ttf'),
            'IBMPlexSans-Regular': require('@/assets/fonts/IBMPlexSans-Regular.ttf'),
            'IBMPlexSans-Italic': require('@/assets/fonts/IBMPlexSans-Italic.ttf'),
            'IBMPlexSans-SemiBold': require('@/assets/fonts/IBMPlexSans-SemiBold.ttf'),
            'IBMPlexMono-Regular': require('@/assets/fonts/IBMPlexMono-Regular.ttf'),
            'IBMPlexMono-Italic': require('@/assets/fonts/IBMPlexMono-Italic.ttf'),
            'IBMPlexMono-SemiBold': require('@/assets/fonts/IBMPlexMono-SemiBold.ttf'),
            'SourceSerif4-Regular': require('@/assets/fonts/SourceSerif4-Regular.ttf'),
            'SourceSerif4-SemiBold': require('@/assets/fonts/SourceSerif4-Semibold.ttf'),
            'SourceSans3-Regular': require('@/assets/fonts/SourceSans3-Regular.ttf'),
            'SourceSans3-SemiBold': require('@/assets/fonts/SourceSans3-Semibold.ttf'),
            'LXGWNeoZhiSong-Regular': require('@/assets/fonts/LXGWNeoZhiSong-Regular.ttf'),
            'BricolageGrotesque-Bold': require('@/assets/fonts/BricolageGrotesque-Bold.ttf'),
            ...FontAwesome.font,
        });
    });
}

function getDevEnvironmentCredentials(): AuthCredentials | null {
    if (!__DEV__) {
        return null;
    }

    const token = process.env.EXPO_PUBLIC_DEV_TOKEN;
    const secret = process.env.EXPO_PUBLIC_DEV_SECRET;
    if (!token || !secret) {
        return null;
    }

    return { token, secret };
}

export default function RootLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const { theme } = useUnistyles();
    const navigationTheme = React.useMemo(() => {
        if (theme.dark) {
            return {
                ...DarkTheme,
                colors: {
                    ...DarkTheme.colors,
                    background: theme.colors.groupped.background,
                }
            }
        }
        return {
            ...DefaultTheme,
            colors: {
                ...DefaultTheme.colors,
                background: theme.colors.groupped.background,
            }
        };
    }, [theme.dark]);

    //
    // Init sequence
    //
    const [initState, setInitState] = React.useState<{ credentials: AuthCredentials | null } | null>(null);
    const [serverSetupRequired, setServerSetupRequired] = React.useState(isPreviewServerSetupRequired);
    React.useEffect(() => subscribeServerConfig(() => {
        setServerSetupRequired(isPreviewServerSetupRequired());
    }), []);

    React.useEffect(() => {
        (async () => {
            try {
                await loadFonts();
                await sodium.ready;

                const requiresServerSetup = isPreviewServerSetupRequired();
                const credentials = await bootstrapAuth({
                    requiresServerSetup,
                    devCredentials: getDevEnvironmentCredentials(),
                });
                setServerSetupRequired(requiresServerSetup);
                setInitState({ credentials });
            } catch (error) {
                console.error('Error initializing:', error);
            }
        })();
    }, []);

    React.useEffect(() => {
        if (initState && serverSetupRequired && pathname !== '/server') {
            router.replace('/server');
        }
    }, [initState, pathname, router, serverSetupRequired]);

    React.useEffect(() => {
        if (initState && (!serverSetupRequired || pathname === '/server')) {
            setTimeout(() => {
                SplashScreen.hideAsync();
            }, 100);
        }
    }, [initState, pathname, serverSetupRequired]);

    const handledNotificationIds = React.useRef<Set<string>>(new Set());
    const handleNotificationResponse = React.useCallback(async (response: Notifications.NotificationResponse | null) => {
        if (!response) {
            console.log('[PUSH ROUTING] Notification response is null');
            return;
        }

        console.log('[PUSH ROUTING] Full notification response:\n' + stringifyNotificationPayload(response));

        const responseId = response.notification.request.identifier;
        if (handledNotificationIds.current.has(responseId)) {
            console.log(`[PUSH ROUTING] Duplicate notification response ignored: ${responseId}`);
            return;
        }

        handledNotificationIds.current.add(responseId);

        try {
            if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
                console.log(`[PUSH ROUTING] Ignoring non-default action: ${response.actionIdentifier}`);
                return;
            }

            console.log(
                '[PUSH ROUTING] notification.request.content.data:\n' +
                stringifyNotificationPayload(response.notification.request.content.data)
            );
            const route = getSessionRouteFromNotificationResponse(response);
            console.log(`[PUSH ROUTING] Computed route: ${route ?? 'null'}`);
            if (!route) {
                console.log('[PUSH ROUTING] No session route found in notification.request.content.data');
                return;
            }

            const encodedSessionId = route.replace(/^\/session\//, '');
            const sessionId = (() => {
                try {
                    return decodeURIComponent(encodedSessionId);
                } catch {
                    return encodedSessionId;
                }
            })();
            console.log(`[PUSH ROUTING] Navigating to session: ${sessionId}`);
            navigateToSession(router, sessionId);
        } finally {
            try {
                await Notifications.clearLastNotificationResponseAsync();
            } catch (error) {
                console.log('Failed to clear last notification response:', error);
            }
        }
    }, [router]);

    React.useEffect(() => {
        if (!initState || serverSetupRequired) {
            return;
        }

        let active = true;
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            void handleNotificationResponse(response);
        });

        void (async () => {
            try {
                const response = await Notifications.getLastNotificationResponseAsync();
                if (active) {
                    await handleNotificationResponse(response);
                }
            } catch (error) {
                console.log('Failed to read last notification response:', error);
            }
        })();

        return () => {
            active = false;
            subscription.remove();
        };
    }, [handleNotificationResponse, initState, serverSetupRequired]);


    // Sync console output toggle from local debug settings.
    const consoleLoggingEnabled = useLocalSetting('consoleLoggingEnabled');
    React.useEffect(() => {
        setConsoleOutputEnabled(consoleLoggingEnabled);
    }, [consoleLoggingEnabled]);

    //
    // Not inited
    //

    if (!initState) {
        return null;
    }

    //
    // Boot
    //

    let providers = (
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <KeyboardProvider preload={true}>
                <GestureHandlerRootView style={{ flex: 1 }}>
                    <AuthProvider initialCredentials={initState.credentials}>
                        <ThemeProvider value={navigationTheme}>
                            <StatusBarProvider />
                            <ModalProvider>
                                <HorizontalSafeAreaWrapper>
                                    <SidebarNavigator />
                                </HorizontalSafeAreaWrapper>
                            </ModalProvider>
                        </ThemeProvider>
                    </AuthProvider>
                </GestureHandlerRootView>
            </KeyboardProvider>
        </SafeAreaProvider>
    );
    return providers;
}
