import { decodeBase64, encodeBase64, encodeBase64Url } from '@/api/encryption';
import { configuration } from '@/configuration';
import { randomBytes, randomUUID } from 'node:crypto';
import tweetnacl from 'tweetnacl';
import axios from 'axios';
import { displayQRCode } from './qrcode';
import { delay } from '@/utils/time';
import { writeCredentialsLegacy, readCredentials, updateSettings, type Credentials, writeCredentialsDataKey } from '@/persistence';
import { logger } from './logger';

/** Authenticate the local Pi/lynttyd installation with the mobile app. */
export async function doAuth(): Promise<Credentials | null> {
    console.clear();
    const secret = new Uint8Array(randomBytes(32));
    const keypair = tweetnacl.box.keyPair.fromSecretKey(secret);

    try {
        if (process.env.DEBUG) {
            console.log(`[AUTH DEBUG] Sending auth request to: ${configuration.serverUrl}/v1/auth/request`);
            console.log(`[AUTH DEBUG] Public key: ${encodeBase64(keypair.publicKey).substring(0, 20)}...`);
        }
        await axios.post(`${configuration.serverUrl}/v1/auth/request`, {
            publicKey: encodeBase64(keypair.publicKey),
            supportsV2: true,
        }, {
            headers: { 'X-Lyntty-Client': `cli/${configuration.currentCliVersion}` },
        });
    } catch (error) {
        if (process.env.DEBUG) console.log('[AUTH DEBUG] Failed to send auth request:', error);
        console.log(formatAuthRequestFailure(error, configuration.serverUrl));
        return null;
    }

    console.clear();
    console.log('\nMobile Authentication\n');
    console.log('Scan this QR code with your Lyntty mobile app:\n');
    const authUrl = 'lyntty://terminal?' + encodeBase64Url(keypair.publicKey);
    displayQRCode(authUrl);
    console.log('\nOr manually enter this URL:');
    console.log(authUrl);
    console.log('');
    return waitForAuthentication(keypair);
}

async function waitForAuthentication(keypair: tweetnacl.BoxKeyPair): Promise<Credentials | null> {
    process.stdout.write('Waiting for authentication');
    let dots = 0;
    let cancelled = false;
    const handleInterrupt = () => {
        cancelled = true;
        console.log('\n\nAuthentication cancelled.');
        process.exit(0);
    };
    process.on('SIGINT', handleInterrupt);

    try {
        while (!cancelled) {
            try {
                const response = await axios.post(`${configuration.serverUrl}/v1/auth/request`, {
                    publicKey: encodeBase64(keypair.publicKey),
                    supportsV2: true,
                }, {
                    headers: { 'X-Lyntty-Client': `cli/${configuration.currentCliVersion}` },
                });
                if (response.data.state === 'authorized') {
                    const token = response.data.token as string;
                    const decrypted = decryptWithEphemeralKey(decodeBase64(response.data.response), keypair.secretKey);
                    if (!decrypted) {
                        console.log('\n\nFailed to decrypt response. Please try again.');
                        return null;
                    }
                    if (decrypted.length === 32) {
                        await writeCredentialsLegacy({ secret: decrypted, token });
                        console.log('\n\n✓ Authentication successful\n');
                        return { encryption: { type: 'legacy', secret: decrypted }, token };
                    }
                    if (decrypted[0] === 0) {
                        const credentials = {
                            publicKey: decrypted.slice(1, 33),
                            machineKey: randomBytes(32),
                            token,
                        };
                        await writeCredentialsDataKey(credentials);
                        console.log('\n\n✓ Authentication successful\n');
                        return {
                            encryption: {
                                type: 'dataKey',
                                publicKey: credentials.publicKey,
                                machineKey: credentials.machineKey,
                            },
                            token,
                        };
                    }
                    console.log('\n\nFailed to decrypt response. Please try again.');
                    return null;
                }
            } catch (error) {
                console.log('\n\n' + formatAuthRequestFailure(error, configuration.serverUrl));
                return null;
            }
            process.stdout.write('\rWaiting for authentication' + '.'.repeat((dots % 3) + 1) + '   ');
            dots += 1;
            await delay(1000);
        }
    } finally {
        process.off('SIGINT', handleInterrupt);
    }
    return null;
}

export function formatAuthRequestFailure(error: unknown, serverUrl: string): string {
    const base = `Failed to create authentication request against ${serverUrl}.`;
    if (axios.isAxiosError(error)) {
        const code = error.code;
        const status = error.response?.status;
        if (code === 'ECONNREFUSED') {
            return `${base}\nLyntty relay is not running or is not reachable at that address. Start the standalone Relay, then retry:\n  lyntty-relay serve\n  lyntty auth login --force`;
        }
        if (code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
            return `${base}\nNetwork error ${code}. Check LYNTTY_SERVER_URL / saved serverUrl and relay connectivity, then retry auth.`;
        }
        if (status === 404) {
            return `${base}\nThe server responded 404 for /v1/auth/request. This URL is not a compatible Lyntty relay or the relay route set is incomplete.`;
        }
        if (status === 401) {
            return `${base}\nThe relay rejected the auth request as unauthorized. Check relay/auth configuration, then retry.`;
        }
        if (status && status >= 500) {
            return `${base}\nThe relay returned HTTP ${status}. Check relay logs and restart the relay if needed.`;
        }
        if (status) return `${base}\nThe relay returned HTTP ${status}. Check the server URL and relay logs.`;
    }
    return `${base}\nPlease check that the Lyntty relay is running and reachable, then retry.`;
}

export function decryptWithEphemeralKey(encryptedBundle: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null {
    if (encryptedBundle.length < 32 + tweetnacl.box.nonceLength) return null;
    const ephemeralPublicKey = encryptedBundle.slice(0, 32);
    const nonce = encryptedBundle.slice(32, 32 + tweetnacl.box.nonceLength);
    const encrypted = encryptedBundle.slice(32 + tweetnacl.box.nonceLength);
    const decrypted = tweetnacl.box.open(encrypted, nonce, ephemeralPublicKey, recipientSecretKey);
    return decrypted ? new Uint8Array(decrypted) : null;
}

export async function authAndSetupMachineIfNeeded(): Promise<{ credentials: Credentials; machineId: string }> {
    logger.debug('[AUTH] Starting auth and machine setup...');
    let credentials = await readCredentials();
    let newAuth = false;
    if (!credentials) {
        logger.debug('[AUTH] No credentials found, starting mobile authentication...');
        const authResult = await doAuth();
        if (!authResult) throw new Error('Authentication failed or was cancelled');
        credentials = authResult;
        newAuth = true;
    } else {
        logger.debug('[AUTH] Using existing credentials');
    }

    const settings = await updateSettings(current => {
        if (newAuth || !current.machineId) return { ...current, machineId: randomUUID() };
        return current;
    });
    logger.debug(`[AUTH] Machine ID: ${settings.machineId}`);
    return { credentials, machineId: settings.machineId! };
}
