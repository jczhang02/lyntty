import { describe, expect, it, vi } from 'bun:test';

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString() { return undefined; }
        set() {}
    },
}));

import { addPiSessionTombstone, parsePiSessionTombstones } from './persistence';

describe('Pi session tombstone persistence', () => {
    it('keeps valid account-scoped identities and ignores malformed data', () => {
        expect(parsePiSessionTombstones(JSON.stringify([
            {
                serverId: 'account-a',
                relaySessionId: 'relay-a',
                relaySessionTag: 'pi:stable-a',
                machineId: 'machine-a',
                piSessionId: 'pi-a',
                deletedAt: 20,
            },
            { serverId: 'account-a', relaySessionId: 42, deletedAt: 10 },
            { serverId: 'account-a', relaySessionId: 'relay-bad-tag', relaySessionTag: 42, deletedAt: 9 },
        ]))).toEqual([{
            serverId: 'account-a',
            relaySessionId: 'relay-a',
            relaySessionTag: 'pi:stable-a',
            machineId: 'machine-a',
            piSessionId: 'pi-a',
            deletedAt: 20,
        }]);
    });

    it('deduplicates by relay id, stable tag, or Pi identity without crossing accounts', () => {
        const current = [
            { serverId: 'account-a', relaySessionId: 'relay-old', relaySessionTag: 'pi:stable-a', deletedAt: 1 },
            { serverId: 'account-b', relaySessionId: 'relay-b', machineId: 'machine-a', piSessionId: 'pi-a', deletedAt: 2 },
        ];
        const next = addPiSessionTombstone(current, {
            serverId: 'account-a',
            relaySessionId: 'relay-new',
            relaySessionTag: 'pi:stable-a',
            machineId: 'machine-a',
            piSessionId: 'pi-new',
            deletedAt: 3,
        });

        expect(next).toEqual([
            { serverId: 'account-a', relaySessionId: 'relay-new', relaySessionTag: 'pi:stable-a', machineId: 'machine-a', piSessionId: 'pi-new', deletedAt: 3 },
            { serverId: 'account-b', relaySessionId: 'relay-b', machineId: 'machine-a', piSessionId: 'pi-a', deletedAt: 2 },
        ]);
    });
});
