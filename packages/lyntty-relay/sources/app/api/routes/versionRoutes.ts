import { z } from "zod";
import { type Fastify } from "../types";
import * as semver from "semver";

const DEFAULT_ANDROID_STABLE_MANIFEST_URL = "https://github.com/jczhang02/lyntty/releases/latest/download/latest.json";
const DEFAULT_MANIFEST_CACHE_MS = 10 * 60 * 1000;

const AndroidUpdateManifestSchema = z.object({
    platform: z.literal("android"),
    appId: z.string(),
    releaseChannel: z.enum(["stable", "preview"]),
    versionName: z.string(),
    versionCode: z.number().int().nonnegative(),
    apkUrl: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    notes: z.string().optional(),
    publishedAt: z.string().optional(),
});

type AndroidUpdateManifest = z.infer<typeof AndroidUpdateManifestSchema>;

type AndroidReleaseChannel = AndroidUpdateManifest["releaseChannel"];

type CachedManifest = {
    manifest: AndroidUpdateManifest;
    expiresAt: number;
};

const cachedAndroidManifests = new Map<AndroidReleaseChannel, CachedManifest>();
const androidManifestFetches = new Map<AndroidReleaseChannel, Promise<AndroidUpdateManifest | null>>();

export function resetVersionRouteCacheForTests() {
    cachedAndroidManifests.clear();
    androidManifestFetches.clear();
}

function getAndroidManifestUrl(channel: AndroidReleaseChannel): string | null {
    if (channel === "preview") return process.env.LYNTTY_ANDROID_PREVIEW_MANIFEST_URL || null;
    return process.env.LYNTTY_ANDROID_STABLE_MANIFEST_URL
        || process.env.LYNTTY_ANDROID_UPDATE_MANIFEST_URL
        || DEFAULT_ANDROID_STABLE_MANIFEST_URL;
}

function getManifestCacheMs() {
    const raw = process.env.LYNTTY_UPDATE_MANIFEST_CACHE_MS;
    if (!raw) return DEFAULT_MANIFEST_CACHE_MS;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MANIFEST_CACHE_MS;
}

async function fetchAndroidManifest(channel: AndroidReleaseChannel): Promise<AndroidUpdateManifest | null> {
    const manifestUrl = getAndroidManifestUrl(channel);
    if (!manifestUrl) return null;
    const response = await fetch(manifestUrl, {
        headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
        throw new Error(`manifest request failed with ${response.status}`);
    }

    const manifest = AndroidUpdateManifestSchema.parse(await response.json());
    if (manifest.releaseChannel !== channel) {
        throw new Error(`manifest channel ${manifest.releaseChannel} does not match requested ${channel}`);
    }
    return manifest;
}

export function shouldUpdateAndroid(manifest: AndroidUpdateManifest, current: {
    appId: string;
    releaseChannel: AndroidReleaseChannel;
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

async function getAndroidManifest(channel: AndroidReleaseChannel): Promise<AndroidUpdateManifest | null> {
    const cached = cachedAndroidManifests.get(channel);
    if (cached && cached.expiresAt > Date.now()) return cached.manifest;

    if (!androidManifestFetches.has(channel)) {
        androidManifestFetches.set(channel, fetchAndroidManifest(channel)
            .then((manifest) => {
                if (manifest) {
                    cachedAndroidManifests.set(channel, {
                        manifest,
                        expiresAt: Date.now() + getManifestCacheMs(),
                    });
                }
                return manifest;
            })
            .finally(() => {
                androidManifestFetches.delete(channel);
            }));
    }

    try {
        return await androidManifestFetches.get(channel)!;
    } catch {
        return cachedAndroidManifests.get(channel)?.manifest ?? null;
    }
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

        const manifest = await getAndroidManifest(requestedChannel);
        if (!manifest) {
            request.log.warn({ releaseChannel: requestedChannel }, 'Android update manifest unavailable');
            reply.send({ update_required: false, update_url: null });
            return;
        }

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
            apk_url: manifest.apkUrl,
            update_url: manifest.apkUrl,
            sha256: manifest.sha256,
            notes: manifest.notes,
            release_channel: manifest.releaseChannel,
        });
    });
}
