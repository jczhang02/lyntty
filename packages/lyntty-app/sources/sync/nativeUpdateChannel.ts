export type NativeUpdateChannel = 'stable' | 'preview';

const ANDROID_APP_IDS: Record<NativeUpdateChannel, string> = {
    stable: 'dev.jczhang.lyntty',
    preview: 'dev.jczhang.lyntty.preview',
};

export function resolveAndroidUpdateChannel(
    appEnv: unknown,
    applicationId: string,
): NativeUpdateChannel | null {
    const channel = appEnv === 'production'
        ? 'stable'
        : appEnv === 'preview'
            ? 'preview'
            : null;
    if (!channel || ANDROID_APP_IDS[channel] !== applicationId) return null;
    return channel;
}
