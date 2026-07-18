import { describe, expect, it } from 'bun:test';
import { orderApiMessagesForReducer } from './messageOrdering';

describe('orderApiMessagesForReducer', () => {
    it('restores chronological turn order for newest-first backward pages', () => {
        const messages = [
            { seq: 18, id: 'end' },
            { seq: 17, id: 'text' },
            { seq: 16, id: 'start' },
        ] as never;

        expect(orderApiMessagesForReducer(messages).map((message) => message.id)).toEqual([
            'start',
            'text',
            'end',
        ]);
    });
});
