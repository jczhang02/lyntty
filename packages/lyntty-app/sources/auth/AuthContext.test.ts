import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'bun:test';

import { AuthProvider, useAuth } from './AuthContext';
import type { AuthCredentials } from './tokenStorage';

const mocks = {
  setCredentials: vi.fn(),
  removeCredentials: vi.fn(),
  syncCreate: vi.fn(),
  syncReset: vi.fn(),
  clearPersistence: vi.fn(),
  loadRegisteredPushToken: vi.fn(),
  unregisterPushToken: vi.fn(),
};

vi.mock('./tokenStorage', () => ({
  TokenStorage: {
    setCredentials: mocks.setCredentials,
    removeCredentials: mocks.removeCredentials,
  },
}));

vi.mock('@/sync/sync', () => ({
  syncCreate: mocks.syncCreate,
  syncReset: mocks.syncReset,
}));

vi.mock('@/sync/persistence', () => ({
  clearPersistence: mocks.clearPersistence,
  loadRegisteredPushToken: mocks.loadRegisteredPushToken,
}));

vi.mock('@/sync/apiPush', () => ({
  unregisterPushToken: mocks.unregisterPushToken,
}));

function AuthProbe({ onAuth }: { onAuth: (auth: ReturnType<typeof useAuth>) => void }) {
  const auth = useAuth();
  onAuth(auth);
  return null;
}

describe('AuthProvider login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setCredentials.mockResolvedValue(true);
    mocks.removeCredentials.mockResolvedValue(undefined);
    mocks.syncCreate.mockReturnValue(new Promise(() => {}));
    mocks.loadRegisteredPushToken.mockReturnValue(null);
  });

  it('does not keep Create account spinning while initial sync is still running', async () => {
    let auth!: ReturnType<typeof useAuth>;
    const initialCredentials: AuthCredentials | null = null;

    await act(async () => {
      create(React.createElement(
        AuthProvider,
        {
          initialCredentials,
          children: React.createElement(AuthProbe, { onAuth: (value) => { auth = value; } }),
        }
      ));
    });

    await expect(auth.login('new-token', 'new-secret')).resolves.toBeUndefined();

    expect(mocks.setCredentials).toHaveBeenCalledWith({ token: 'new-token', secret: 'new-secret' });
    expect(mocks.syncCreate).toHaveBeenCalledWith({ token: 'new-token', secret: 'new-secret' });
  });
});
