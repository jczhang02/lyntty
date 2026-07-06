import { describe, expect, it } from 'vitest';

import type { Machine, PiMachineSessionRecord, Session } from './storageTypes';
import { mergePiDiscoveredSessions } from './piDiscoveredSessions';

const machine: Machine = {
    id: 'machine-1',
    seq: 1,
    createdAt: 1,
    updatedAt: 1,
    active: true,
    activeAt: 1,
    metadata: {
        host: 'thinkpad',
        platform: 'linux',
        lynttyCliVersion: '1.1.10',
        lynttyHomeDir: '/home/jc/.lyntty',
        homeDir: '/home/jc',
        cliAvailability: {
            pi: true,
            claude: false,
            codex: false,
            gemini: false,
            openclaw: false,
            detectedAt: 10,
        },
    },
    metadataVersion: 1,
    daemonState: null,
    daemonStateVersion: 1,
};

function relaySession(overrides: Partial<Session> = {}): Omit<Session, 'presence'> & { presence?: Session['presence'] } {
    return {
        id: 'relay-1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: false,
        activeAt: 100,
        metadata: {
            path: '/repo',
            host: 'thinkpad',
            machineId: 'machine-1',
            flavor: 'pi',
            piSessionId: 'pi-registered',
            name: 'Old title',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        ...overrides,
    };
}

function piRecord(overrides: Partial<PiMachineSessionRecord>): PiMachineSessionRecord {
    return {
        state: 'discovered_local',
        piSessionId: 'pi-local',
        cwd: '/home/jc/dev/lyntty',
        name: 'Pi canonical title',
        createdAt: 1_000,
        modifiedAt: 2_000,
        firstMessage: 'first prompt',
        messageCount: 42,
        needsRegistration: true,
        needsBackfill: true,
        hasHistoryGap: false,
        reason: 'local Pi JSONL session is not registered with relay',
        ...overrides,
    };
}

describe('mergePiDiscoveredSessions', () => {
    it('adds node-local Pi sessions to Sessions Home data', () => {
        const sessions = mergePiDiscoveredSessions([], [{ machine, sessions: [piRecord({})] }]);

        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
            id: 'pi-local:machine-1:pi-local',
            createdAt: 1_000,
            updatedAt: 2_000,
            activeAt: 2_000,
            active: false,
            metadata: {
                name: 'Pi canonical title',
                path: '/home/jc/dev/lyntty',
                machineId: 'machine-1',
                piSessionId: 'pi-local',
                piDiscoveryState: 'discovered_local',
                piMessageCount: 42,
                piFirstMessage: 'first prompt',
                piHistoryHasMore: true,
                piHistoryTotalMessages: 42,
                piSynthetic: true,
                runtimeOwner: 'lyntty-sdk',
                controlState: 'queued',
            },
        });
    });

    it('hides old empty relay rows that only represent missing Pi history', () => {
        const sessions = mergePiDiscoveredSessions([
            relaySession({
                seq: 0,
                active: true,
                metadata: {
                    path: '/repo',
                    host: 'thinkpad',
                    machineId: 'machine-1',
                    flavor: 'pi',
                    piSessionId: 'pi-missing',
                    piDiscoveryState: 'missing_local_history',
                    piHasHistoryGap: true,
                },
            }),
        ], []);

        expect(sessions).toEqual([]);
    });

    it('hides missing-local and inactive zero-message Pi discovery rows', () => {
        const sessions = mergePiDiscoveredSessions([], [{
            machine,
            sessions: [
                piRecord({ state: 'missing_local_history', piSessionId: 'pi-missing', messageCount: 0, hasHistoryGap: true }),
                piRecord({ piSessionId: 'pi-empty', messageCount: 0, firstMessage: undefined }),
            ],
        }]);

        expect(sessions).toEqual([]);
    });

    it('marks active runtime synthetic Pi rows as online active sessions', () => {
        const sessions = mergePiDiscoveredSessions([], [{
            machine,
            sessions: [piRecord({
                state: 'active_runtime',
                piSessionId: 'pi-active',
                name: 'Active Pi',
                messageCount: 0,
            })],
        }]);

        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
            id: 'pi-local:machine-1:pi-active',
            active: true,
            presence: 'online',
            metadata: {
                piSessionId: 'pi-active',
                piSynthetic: true,
                piDiscoveryState: 'active_runtime',
                lifecycleState: 'running',
                runtimeOwner: 'pi-extension',
                controlState: 'ready',
                name: 'Active Pi',
            },
        });
    });

    it('merges thousands of node-local Pi sessions without dropping rows', () => {
        const records = Array.from({ length: 5000 }, (_value, index) => piRecord({
            piSessionId: `pi-${index}`,
            name: `Session ${index}`,
            modifiedAt: 1_700_000_000_000 + index,
        }));

        const sessions = mergePiDiscoveredSessions([], [{ machine, sessions: records }]);

        expect(sessions).toHaveLength(5000);
        expect(sessions[0]).toMatchObject({
            id: 'pi-local:machine-1:pi-0',
            metadata: expect.objectContaining({ name: 'Session 0', piSynthetic: true }),
        });
        expect(new Set(sessions.map((session) => session.id)).size).toBe(5000);
    });

    it('marks real relay rows active when Pi discovery reports an active runtime', () => {
        const sessions = mergePiDiscoveredSessions([relaySession()], [{
            machine,
            sessions: [piRecord({
                state: 'active_runtime',
                piSessionId: 'pi-registered',
                relaySessionId: 'relay-1',
                modifiedAt: 2_000,
                registeredUpdatedAt: 5_000,
                needsRegistration: false,
                reason: 'local Pi session is currently active',
            })],
        }]);

        expect(sessions).toHaveLength(1);
        expect(sessions[0]).toMatchObject({
            id: 'relay-1',
            active: true,
            activeAt: 5_000,
            presence: 'online',
            metadata: {
                piSessionId: 'pi-registered',
                piDiscoveryState: 'active_runtime',
                piSynthetic: false,
                runtimeOwner: 'pi-extension',
                controlState: 'ready',
            },
        });
    });

    it('updates relay sessions with canonical Pi title and history info without replacing real path', () => {
        const sessions = mergePiDiscoveredSessions([
            relaySession({
                metadata: {
                    path: '/home/jc',
                    host: 'thinkpad',
                    machineId: 'machine-1',
                    flavor: 'pi',
                    piSessionId: 'pi-registered',
                    name: 'Old title',
                },
            }),
        ], [{
            machine,
            sessions: [piRecord({
                state: 'registered',
                piSessionId: 'pi-registered',
                relaySessionId: 'relay-1',
                cwd: '~',
                name: 'Renamed in Pi',
                messageCount: 99,
                needsRegistration: false,
                reason: 'local Pi session is registered and in sync',
            })],
        }]);

        expect(sessions).toHaveLength(1);
        expect(sessions[0].metadata).toMatchObject({
            path: '/home/jc',
            name: 'Renamed in Pi',
            piSessionId: 'pi-registered',
            piDiscoveryState: 'registered',
            piMessageCount: 99,
            piSynthetic: false,
        });
    });
});
