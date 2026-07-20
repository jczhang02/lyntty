import React from 'react';
import type { AuthCredentials } from '@/auth/tokenStorage';
import { AuthProvider } from '@/auth/AuthContext';
import { SidebarNavigator } from '@/components/SidebarNavigator';
import { useLocalSetting } from '@/sync/storage';
import { setConsoleOutputEnabled } from '@/utils/consoleLogging';

export default function BootstrappedNavigator({
    initialCredentials,
}: {
    initialCredentials: AuthCredentials | null;
}) {
    const consoleLoggingEnabled = useLocalSetting('consoleLoggingEnabled');
    React.useEffect(() => {
        setConsoleOutputEnabled(consoleLoggingEnabled);
    }, [consoleLoggingEnabled]);

    return (
        <AuthProvider initialCredentials={initialCredentials}>
            <SidebarNavigator />
        </AuthProvider>
    );
}
