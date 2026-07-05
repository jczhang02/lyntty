import { describe, expect, it } from 'vitest';
import { expectsRemotePiEcho } from './remoteCommandEcho';

describe('expectsRemotePiEcho', () => {
    it('keeps ordinary mobile text and supported skill commands in queued state until Pi echoes them', () => {
        expect(expectsRemotePiEcho('hello current pi')).toBe(true);
        expect(expectsRemotePiEcho('/skill:coding-standards review this')).toBe(true);
    });

    it('does not leave local result-only slash commands stuck as Sending', () => {
        expect(expectsRemotePiEcho('/goal')).toBe(false);
        expect(expectsRemotePiEcho('/context')).toBe(false);
        expect(expectsRemotePiEcho('/unknown command')).toBe(false);
    });
});
