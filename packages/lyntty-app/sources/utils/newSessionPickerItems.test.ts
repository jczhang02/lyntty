import { describe, expect, it } from 'vitest';
import { getAgentPickerItems, getModePickerItems } from './newSessionPickerItems';

describe('new session picker items', () => {
    it('maps agents to picker item labels', () => {
        expect(getAgentPickerItems([
            { key: 'pi', label: 'pi' },
        ])).toEqual([
            { key: 'pi', label: 'pi' },
        ]);
    });

    it('maps model, effort, and permission options with descriptions', () => {
        expect(getModePickerItems([
            { key: 'default', name: 'default model', description: null },
            { key: 'fast', name: 'fast model', description: 'lower latency' },
        ])).toEqual([
            { key: 'default', label: 'default model' },
            { key: 'fast', label: 'fast model', subtitle: 'lower latency' },
        ]);
    });
});
