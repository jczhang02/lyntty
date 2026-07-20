import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TokenStorage, type AuthCredentials } from '@/auth/tokenStorage';
import { subscribeAuthInvalidation } from '@/auth/authInvalidation';
import { clearStoredAuthState } from './bootstrapAuth';

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
        await clearStoredAuthState();
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
            setCredentials(newCredentials);
            setIsAuthenticated(true);
            void import('@/sync/sync').then(({ syncCreate }) => syncCreate(newCredentials)).catch((error) => {
                console.error('Failed to initialize sync after login:', error);
            });
        } else {
            throw new Error('Failed to save credentials');
        }
    };

    const logout = async (options?: { skipPushUnregister?: boolean }) => {
        if (credentials && !options?.skipPushUnregister) {
            const [{ loadRegisteredPushToken }, { unregisterPushToken }] = await Promise.all([
                import('@/sync/persistence'),
                import('@/sync/apiPush'),
            ]);
            const registeredPushToken = loadRegisteredPushToken();
            if (registeredPushToken) {
                try {
                    await unregisterPushToken(credentials, registeredPushToken);
                } catch (error) {
                    console.log('Failed to unregister push token during logout:', error);
                }
            }
        }
        await clearLocalAuth();
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
