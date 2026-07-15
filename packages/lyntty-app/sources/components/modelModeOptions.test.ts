import { describe, expect, it } from 'vitest';
import {
    getAvailableModels,
    getAvailablePermissionModes,
    getDefaultEffortKey,
    getDefaultModelKey,
    getDefaultPermissionModeKey,
    getHardcodedEffortLevels,
    getPiModelModes,
    getPiPermissionModes,
    mapMetadataOptions,
    resolveCurrentOption,
} from './modelModeOptions';

const translate = (key: string) => `tr:${key}`;

describe('Pi model and permission options', () => {
    it('maps metadata option shape into mode options', () => {
        expect(mapMetadataOptions([
            { code: 'm1', value: 'Model One', description: 'Primary model' },
            { code: 'm2', value: 'Model Two' },
        ])).toEqual([
            { key: 'm1', name: 'Model One', description: 'Primary model' },
            { key: 'm2', name: 'Model Two', description: null },
        ]);
    });

    it('offers only Pi fallback modes', () => {
        expect(getPiPermissionModes(translate)).toEqual([
            { key: 'default', name: 'tr:agentInput.permissionMode.default', description: null },
        ]);
        expect(getPiModelModes()).toEqual([
            { key: 'default', name: 'pi default', description: null },
        ]);
        expect(getHardcodedEffortLevels('pi')).toEqual([]);
    });

    it('offers current options only to Pi sessions', () => {
        expect(getDefaultPermissionModeKey('pi')).toBe('default');
        expect(getDefaultModelKey('pi')).toBe('default');
        expect(getDefaultEffortKey('pi')).toBeNull();
        expect(getAvailablePermissionModes('pi', null, translate).map((mode) => mode.key)).toEqual(['default']);
        expect(getAvailablePermissionModes('codex', null, translate)).toEqual([]);
    });

    it('accepts machine-advertised models only for Pi metadata', () => {
        const metadata = {
            models: [{ code: 'pi-custom', value: 'Pi Custom', description: 'From lynttyd' }],
        } as any;

        expect(getAvailableModels('pi', metadata, translate)).toEqual([
            { key: 'pi-custom', name: 'Pi Custom', description: 'From lynttyd' },
        ]);
        expect(getAvailableModels('codex', metadata, translate)).toEqual([]);
    });

    it('resolves the first matching preferred key', () => {
        const options = [
            { key: 'a', name: 'A' },
            { key: 'b', name: 'B' },
        ];

        expect(resolveCurrentOption(options, ['missing', 'b', 'a'])).toEqual({ key: 'b', name: 'B' });
        expect(resolveCurrentOption(options, ['missing'])).toBeNull();
    });
});
