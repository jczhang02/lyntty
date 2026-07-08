import React, { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Modal } from '@/modal';
import { CommandPalette } from './CommandPalette';
import { Command } from './types';
import { useGlobalKeyboard } from '@/hooks/useGlobalKeyboard';
import { useAuth } from '@/auth/AuthContext';
import { storage } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { t } from '@/text';

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const { logout } = useAuth();
    const sessions = storage(useShallow((state) => state.sessions));
    const commandPaletteEnabled = storage(useShallow((state) => state.localSettings.commandPaletteEnabled));
    const navigateToSession = useNavigateToSession();

    // Define available commands
    const commands = useMemo((): Command[] => {
        const cmds: Command[] = [
            // Navigation commands
            {
                id: 'new-session',
                title: t('appWide.newSession'),
                subtitle: t('appWide.startANewChatSession'),
                icon: 'add-circle-outline',
                category: 'Sessions',
                shortcut: '⌘N',
                action: () => {
                    router.navigate('/new');
                }
            },
            {
                id: 'sessions',
                title: t('appWide.viewAllSessions'),
                subtitle: t('appWide.browseYourChatHistory'),
                icon: 'chatbubbles-outline',
                category: 'Sessions',
                action: () => {
                    router.push('/');
                }
            },
            {
                id: 'settings',
                title: t('appWide.settings'),
                subtitle: t('appWide.configureYourPreferences'),
                icon: 'settings-outline',
                category: 'Navigation',
                shortcut: '⌘,',
                action: () => {
                    router.push('/settings');
                }
            },
            {
                id: 'account',
                title: t('appWide.account'),
                subtitle: t('appWide.manageYourAccount'),
                icon: 'person-circle-outline',
                category: 'Navigation',
                action: () => {
                    router.push('/settings/account');
                }
            },
            {
                id: 'connect',
                title: t('appWide.connectDevice'),
                subtitle: t('appWide.connectANewDeviceViaWeb'),
                icon: 'link-outline',
                category: 'Navigation',
                action: () => {
                    router.push('/terminal/connect');
                }
            },
        ];

        // Add session-specific commands
        const recentSessions = Object.values(sessions)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, 5);

        recentSessions.forEach(session => {
            const sessionName = session.metadata?.name || `Session ${session.id.slice(0, 6)}`;
            cmds.push({
                id: `session-${session.id}`,
                title: sessionName,
                subtitle: session.metadata?.path || 'Switch to session',
                icon: 'time-outline',
                category: 'Recent Sessions',
                action: () => {
                    navigateToSession(session.id);
                }
            });
        });

        // System commands
        cmds.push({
            id: 'sign-out',
            title: t('appWide.signOut'),
            subtitle: t('appWide.signOutOfYourAccount'),
            icon: 'log-out-outline',
            category: 'System',
            action: async () => {
                await logout();
            }
        });

        return cmds;
    }, [router, logout, sessions]);

    const showCommandPalette = useCallback(() => {
        if (Platform.OS !== 'web' || !commandPaletteEnabled) return;

        Modal.show({
            component: CommandPalette,
            props: {
                commands,
            }
        } as any);
    }, [commands, commandPaletteEnabled]);

    // Set up global keyboard handler only if feature is enabled
    useGlobalKeyboard(commandPaletteEnabled ? showCommandPalette : () => {});

    return <>{children}</>;
}