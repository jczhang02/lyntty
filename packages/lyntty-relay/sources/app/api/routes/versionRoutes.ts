import {
    CompatibilityBomV1Schema,
    ReleaseTrustStoreSchema,
    compatibilityBomFileBytes,
    selectAndroidRelease,
    verifyCompatibilityBom,
    type CompatibilityBomV1,
    type ReleaseChannel,
} from "lyntty-wire/compatibility";
import { nodeCompatibilityCrypto } from "lyntty-wire/compatibility/node";
import { fetchBoundedJson } from 'lyntty-wire/compatibility/fetch';
import * as semver from "semver";
import { z } from "zod";
import { type Fastify } from "../types";

const DEFAULT_STABLE_BOM_URL = "https://github.com/jczhang02/lyntty/releases/latest/download/compatibility-bom.json";
const DEFAULT_BOM_CACHE_MS = 10 * 60 * 1000;

type CachedBom = {
    bom: CompatibilityBomV1;
    bomSha256: string;
    expiresAt: number;
};

const cachedBoms = new Map<ReleaseChannel, CachedBom>();
const bomFetches = new Map<ReleaseChannel, Promise<CachedBom | null>>();
const highestAcceptedSequences = new Map<ReleaseChannel, number>();

export function resetVersionRouteCacheForTests() {
    cachedBoms.clear();
    bomFetches.clear();
    highestAcceptedSequences.clear();
}

function getBomUrl(channel: ReleaseChannel): string | null {
    if (channel === "preview") return process.env.LYNTTY_PREVIEW_BOM_URL || null;
    return process.env.LYNTTY_STABLE_BOM_URL || DEFAULT_STABLE_BOM_URL;
}

function getSignatureUrl(channel: ReleaseChannel, bomUrl: string): string {
    const explicit = channel === "preview"
        ? process.env.LYNTTY_PREVIEW_BOM_SIGNATURE_URL
        : process.env.LYNTTY_STABLE_BOM_SIGNATURE_URL;
    if (explicit) return explicit;
    if (!bomUrl.endsWith('.json')) throw new Error('Compatibility BOM URL requires an explicit signature URL');
    return `${bomUrl.slice(0, -'.json'.length)}.sig.json`;
}

function getBomCacheMs() {
    const raw = process.env.LYNTTY_BOM_CACHE_MS;
    if (!raw) return DEFAULT_BOM_CACHE_MS;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BOM_CACHE_MS;
}

function configuredMinimumSequence(channel: ReleaseChannel): number {
    const raw = channel === 'stable'
        ? process.env.LYNTTY_STABLE_MINIMUM_BOM_SEQUENCE
        : process.env.LYNTTY_PREVIEW_MINIMUM_BOM_SEQUENCE;
    if (!raw) return 0;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`Invalid ${channel} minimum Compatibility BOM sequence`);
    return parsed;
}

function releaseTrustStore() {
    const raw = process.env.LYNTTY_RELEASE_TRUST_ROOTS;
    if (!raw) return null;
    return ReleaseTrustStoreSchema.parse(JSON.parse(raw));
}

async function fetchVerifiedBom(channel: ReleaseChannel): Promise<CachedBom | null> {
    const bomUrl = getBomUrl(channel);
    const trustStore = releaseTrustStore();
    if (!bomUrl || !trustStore) return null;
    const signatureUrl = getSignatureUrl(channel, bomUrl);
    const [bom, signature] = await Promise.all([
        fetchBoundedJson({
            url: bomUrl,
            canonicalBytes: value => compatibilityBomFileBytes(CompatibilityBomV1Schema.parse(value)),
        }),
        fetchBoundedJson({ url: signatureUrl }),
    ]);
    const minimumSequence = Math.max(
        configuredMinimumSequence(channel),
        highestAcceptedSequences.get(channel) ?? 0,
    );
    const verified = await verifyCompatibilityBom({
        bom,
        signature,
        trustStore,
        crypto: nodeCompatibilityCrypto,
        expectedChannel: channel,
        minimumSequence,
    });
    highestAcceptedSequences.set(channel, verified.bom.sequence);
    return {
        bom: verified.bom,
        bomSha256: verified.bomSha256,
        expiresAt: Date.now() + getBomCacheMs(),
    };
}

async function getVerifiedBom(channel: ReleaseChannel): Promise<CachedBom | null> {
    const cached = cachedBoms.get(channel);
    if (cached && cached.expiresAt > Date.now()) return cached;
    if (!bomFetches.has(channel)) {
        bomFetches.set(channel, fetchVerifiedBom(channel)
            .then(result => {
                if (result) cachedBoms.set(channel, result);
                return result;
            })
            .finally(() => bomFetches.delete(channel)));
    }
    try {
        return await bomFetches.get(channel)!;
    } catch {
        return cachedBoms.get(channel) ?? null;
    }
}

export function shouldUpdateAndroid(manifest: {
    appId: string;
    releaseChannel: ReleaseChannel;
    versionName: string;
    versionCode: number;
}, current: {
    appId: string;
    releaseChannel: ReleaseChannel;
    version?: string;
    versionCode?: number;
}) {
    if (manifest.appId !== current.appId || manifest.releaseChannel !== current.releaseChannel) return false;
    if (typeof current.versionCode === "number") return manifest.versionCode > current.versionCode;
    if (current.version && semver.valid(current.version) && semver.valid(manifest.versionName)) {
        return semver.gt(manifest.versionName, current.version);
    }
    return false;
}

export function versionRoutes(app: Fastify) {
    app.post('/v1/version', {
        schema: {
            body: z.object({
                platform: z.string(),
                version: z.string().optional(),
                version_code: z.number().int().nonnegative().optional(),
                app_id: z.string(),
                release_channel: z.enum(["stable", "preview"]).optional(),
            }),
            response: {
                200: z.object({
                    update_required: z.boolean(),
                    version_name: z.string().optional(),
                    version_code: z.number().int().optional(),
                    apk_url: z.string().url().optional(),
                    update_url: z.string().url().nullable(),
                    sha256: z.string().optional(),
                    notes: z.string().optional(),
                    release_channel: z.enum(["stable", "preview"]).optional(),
                    bom_release_id: z.string().optional(),
                    bom_sequence: z.number().int().nonnegative().optional(),
                    bom_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
                })
            }
        }
    }, async (request, reply) => {
        const { platform, version, version_code, app_id, release_channel } = request.body;
        if (platform.toLowerCase() !== 'android') {
            reply.send({ update_required: false, update_url: null });
            return;
        }
        const requestedChannel = release_channel
            ?? (app_id === "dev.jczhang.lyntty" ? "stable" : null);
        if (!requestedChannel) {
            reply.send({ update_required: false, update_url: null });
            return;
        }
        const verified = await getVerifiedBom(requestedChannel);
        if (!verified) {
            request.log.warn({ releaseChannel: requestedChannel }, 'Signed Compatibility BOM unavailable');
            reply.send({ update_required: false, update_url: null });
            return;
        }
        const android = selectAndroidRelease(verified.bom);
        const manifest = {
            appId: android.packageId,
            releaseChannel: verified.bom.channel,
            versionName: verified.bom.components.app.version,
            versionCode: android.versionCode,
        };
        const updateRequired = shouldUpdateAndroid(manifest, {
            appId: app_id,
            releaseChannel: requestedChannel,
            version,
            versionCode: version_code,
        });
        if (!updateRequired) {
            reply.send({ update_required: false, update_url: null });
            return;
        }
        reply.send({
            update_required: true,
            version_name: manifest.versionName,
            version_code: manifest.versionCode,
            apk_url: android.apk.url,
            update_url: android.apk.url,
            sha256: android.apk.sha256,
            release_channel: verified.bom.channel,
            bom_release_id: verified.bom.releaseId,
            bom_sequence: verified.bom.sequence,
            bom_sha256: verified.bomSha256,
        });
    });
}
