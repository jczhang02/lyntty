import { Linking } from 'react-native';

/** Opens a URL with the native platform handler. */
export async function openExternalUrl(url: string): Promise<void> {
    await Linking.openURL(url);
}
