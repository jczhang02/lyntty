import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TokenStorage, AuthCredentials } from '@/auth/tokenStorage';
import { syncCreate, syncReset } from '@/sync/sync';
import * as Updates from 'expo-updates';
import { clearPersistence, loadRegisteredPushToken } from '@/sync/persistence';
import { unregisterPushToken } from '@/sync/apiPush';
import { Platform } from 'react-native';
import { trackLogout } from '@/track';
import { subscribeAuthInvalidation } from '@/auth/authInvalidation';

interface AuthContextType {
    isAuthenticated: boolean;
    credentials: AuthCredentials | null;
    login: (token: string, secret: string) => Promise<void>;
    logout: (options?: { skipPushUnregister?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, initialCredentials }: { children: ReactNode; initialCredentials: AuthCredentials | null }) {
    const [isAuthenticated, setIsAuthenticated] = useState(!!initialCredentials);
    const [credentials, setCredentials] = useState<AuthCredentials | null>(initialCredentials);

    const clearLocalAuth = async () => {
        syncReset();
        clearPersistence();
        await TokenStorage.removeCredentials();
        setCredentials(null);
        setIsAuthenticated(false);
    };

    // Update global auth state when local state changes
    useEffect(() => {
        setCurrentAuth(credentials ? { isAuthenticated, credentials, login, logout } : null);
    }, [isAuthenticated, credentials]);

    useEffect(() => {
        return subscribeAuthInvalidation(async () => {
            await clearLocalAuth();
        });
    }, []);

    const login = async (token: string, secret: string) => {
        const newCredentials: AuthCredentials = { token, secret };
        const success = await TokenStorage.setCredentials(newCredentials);
        if (success) {
            await syncCreate(newCredentials);
            setCredentials(newCredentials);
            setIsAuthenticated(true);
        } else {
            throw new Error('Failed to save credentials');
        }
    };

    const logout = async (options?: { skipPushUnregister?: boolean }) => {
        trackLogout();
        const registeredPushToken = credentials && !options?.skipPushUnregister ? loadRegisteredPushToken() : null;
        if (credentials && registeredPushToken) {
            try {
                await unregisterPushToken(credentials, registeredPushToken);
            } catch (error) {
                console.log('Failed to unregister push token during logout:', error);
            }
        }
        await clearLocalAuth();

        if (Platform.OS === 'web') {
            window.location.reload();
        } else {
            try {
                await Updates.reloadAsync();
            } catch (error) {
                // In dev mode, reloadAsync will throw ERR_UPDATES_DISABLED
                console.log('Reload failed (expected in dev mode):', error);
            }
        }
    };

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                credentials,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Helper to get current auth state for non-React contexts
let currentAuthState: AuthContextType | null = null;

export function setCurrentAuth(auth: AuthContextType | null) {
    currentAuthState = auth;
}

export function getCurrentAuth(): AuthContextType | null {
    return currentAuthState;
}
