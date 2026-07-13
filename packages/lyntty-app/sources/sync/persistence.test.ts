import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString() { return undefined; }
        set() {}
    },
}));

import { parsePendingOutbox, parsePendingSyntheticOutbox } from './persistence';

describe('pending message outbox persistence', () => {
    it('restores valid encrypted entries and drops malformed data', () => {
        const restored = parsePendingOutbox(JSON.stringify({
            'session-1': [
                { localId: 'local-1', content: 'encrypted-record' },
                { localId: 123, content: 'invalid' },
            ],
            'session-2': 'invalid',
        }));

        expect([...restored.entries()]).toEqual([
            ['session-1', [{ localId: 'local-1', content: 'encrypted-record' }]],
        ]);
    });

    it('restores synthetic-session sends for relay attachment after restart', () => {
        expect([...parsePendingSyntheticOutbox(JSON.stringify({
            'pi:machine-1:session-1': [{ text: 'continue', options: { source: 'chat' } }],
        })).entries()]).toEqual([
            ['pi:machine-1:session-1', [{ text: 'continue', options: { source: 'chat' } }]],
        ]);
    });

    it('fails closed for invalid JSON', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(parsePendingOutbox('{invalid')).toEqual(new Map());
    });
});
