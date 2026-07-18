import { NativeModules, Platform } from 'react-native';
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import {
    cacheDirectory,
    deleteAsync,
    downloadAsync,
    getContentUriAsync,
} from 'expo-file-system/legacy';
import { apkSha256Matches, validApkSha256 } from './apkUpdateIntegrity';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

export type AndroidApkUpdate = {
    updateUrl: string;
    sha256: string;
    versionCode?: number;
};

type LynttyFileHashModule = {
    sha256(uri: string): Promise<string>;
};

export async function sha256File(uri: string): Promise<string> {
    const fileHash = NativeModules.LynttyFileHash as LynttyFileHashModule | undefined;
    if (!fileHash) throw new Error('Native APK verification is unavailable.');
    return fileHash.sha256(uri);
}

export async function openAndroidUnknownSourcesSettings(): Promise<void> {
    if (Platform.OS !== 'android') return;

    await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
        data: `package:${Application.applicationId}`,
    });
}

export async function installAndroidApkUpdate(update: AndroidApkUpdate): Promise<void> {
    if (Platform.OS !== 'android') {
        throw new Error('APK updates are only supported on Android.');
    }
    if (!cacheDirectory) {
        throw new Error('APK cache directory is unavailable.');
    }
    if (!validApkSha256(update.sha256)) {
        throw new Error('Update manifest is missing a valid SHA-256 hash.');
    }

    const localUri = `${cacheDirectory}lyntty-update-${update.versionCode ?? Date.now()}.apk`;
    await deleteAsync(localUri, { idempotent: true }).catch(() => undefined);

    const result = await downloadAsync(update.updateUrl, localUri);
    if (typeof result.status === 'number' && (result.status < 200 || result.status >= 300)) {
        throw new Error(`APK download failed with HTTP ${result.status}.`);
    }

    const actualSha256 = await sha256File(result.uri);
    if (!apkSha256Matches(update.sha256, actualSha256)) {
        await deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
        throw new Error('Downloaded APK SHA-256 did not match the release manifest.');
    }

    const contentUri = await getContentUriAsync(result.uri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: APK_MIME_TYPE,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
    });
}
