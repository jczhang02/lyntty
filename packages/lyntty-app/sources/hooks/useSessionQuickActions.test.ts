import { beforeEach, describe, expect, it, vi } from 'vitest';

const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));

vi.mock('@/modal', () => ({ Modal: { alert } }));
vi.mock('@/text', () => ({ t: (key: string) => key }));

type AlertButton = {
    text: string;
    onPress?: () => void;
};

function buttonsForCall(index: number): AlertButton[] {
    return alert.mock.calls[index]?.[2] as AlertButton[];
}

describe('requestPiResumeTakeoverChoice', () => {
    beforeEach(() => {
        alert.mockReset();
    });

    it('returns wait without opening a destructive takeover prompt', async () => {
        const { requestPiResumeTakeoverChoice } = await import('./piResumeTakeoverChoice');
        const choice = requestPiResumeTakeoverChoice();

        buttonsForCall(0).find((button) => button.text === 'sessionInfo.resumeWait')?.onPress?.();

        await expect(choice).resolves.toBe('wait');
        expect(alert).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['sessionInfo.resumeStop', 'stop'],
        ['sessionInfo.resumeInterrupt', 'interrupt'],
    ] as const)('requires a second explicit confirmation for %s', async (buttonText, expected) => {
        const { requestPiResumeTakeoverChoice } = await import('./piResumeTakeoverChoice');
        const choice = requestPiResumeTakeoverChoice();

        buttonsForCall(0).find((button) => button.text === 'sessionInfo.resumeTakeOver')?.onPress?.();
        buttonsForCall(1).find((button) => button.text === buttonText)?.onPress?.();

        await expect(choice).resolves.toBe(expected);
        expect(alert).toHaveBeenCalledTimes(2);
    });

    it('returns null when the first prompt is cancelled', async () => {
        const { requestPiResumeTakeoverChoice } = await import('./piResumeTakeoverChoice');
        const choice = requestPiResumeTakeoverChoice();

        buttonsForCall(0).find((button) => button.text === 'common.cancel')?.onPress?.();

        await expect(choice).resolves.toBeNull();
        expect(alert).toHaveBeenCalledTimes(1);
    });
});
