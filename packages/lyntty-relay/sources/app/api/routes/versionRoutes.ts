import { z } from "zod";
import { type Fastify } from "../types";
import * as semver from "semver";

const DEFAULT_ANDROID_MANIFEST_URL = "https://github.com/jczhang02/lyntty/releases/latest/download/latest.json";
const DEFAULT_MANIFEST_CACHE_MS = 10 * 60 * 1000;

const AndroidUpdateManifestSchema = z.object({
    platform: z.literal("android"),
    appId: z.string(),
    versionName: z.string(),
    versionCode: z.number().int().nonnegative(),
    apkUrl: z.string().url(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    notes: z.string().optional(),
    publishedAt: z.string().optional(),
});

type AndroidUpdateManifest = z.infer<typeof AndroidUpdateManifestSchema>;

type CachedManifest = {
    manifest: AndroidUpdateManifest;
    expiresAt: number;
};

let cachedAndroidManifest: CachedManifest | null = null;
let androidManifestFetchInFlight: Promise<AndroidUpdateManifest | null> | null = null;

export function resetVersionRouteCacheForTests() {
    cachedAndroidManifest = null;
    androidManifestFetchInFlight = null;
}

function getAndroidManifestUrl() {
    return process.env.LYNTTY_ANDROID_UPDATE_MANIFEST_URL || DEFAULT_ANDROID_MANIFEST_URL;
}

function getManifestCacheMs() {
    const raw = process.env.LYNTTY_UPDATE_MANIFEST_CACHE_MS;
    if (!raw) return DEFAULT_MANIFEST_CACHE_MS;

    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MANIFEST_CACHE_MS;
}

async function fetchAndroidManifest(): Promise<AndroidUpdateManifest> {
    const response = await fetch(getAndroidManifestUrl(), {
        headers: { "Accept": "application/json" },
    });
    if (!response.ok) {
        throw new Error(`manifest request failed with ${response.status}`);
    }

    return AndroidUpdateManifestSchema.parse(await response.json());
}

export function shouldUpdateAndroid(manifest: AndroidUpdateManifest, current: { appId: string; version?: string; versionCode?: number }) {
    if (manifest.appId !== current.appId) return false;
    if (typeof current.versionCode === "number") return manifest.versionCode > current.versionCode;
    if (current.version && semver.valid(current.version) && semver.valid(manifest.versionName)) {
        return semver.gt(manifest.versionName, current.version);
    }
    return false;
}

async function getAndroidManifest(): Promise<AndroidUpdateManifest | null> {
    const now = Date.now();
    if (cachedAndroidManifest && cachedAndroidManifest.expiresAt > now) {
        return cachedAndroidManifest.manifest;
    }

    if (!androidManifestFetchInFlight) {
        androidManifestFetchInFlight = fetchAndroidManifest()
            .then((manifest) => {
                cachedAndroidManifest = {
                    manifest,
                    expiresAt: Date.now() + getManifestCacheMs(),
                };
                return manifest;
            })
            .finally(() => {
                androidManifestFetchInFlight = null;
            });
    }

    try {
        return await androidManifestFetchInFlight;
    } catch {
        return cachedAndroidManifest?.manifest ?? null;
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
                })
            }
        }
    }, async (request, reply) => {
        const { platform, version, version_code, app_id } = request.body;

        if (platform.toLowerCase() !== 'android') {
            reply.send({ update_required: false, update_url: null });
            return;
        }

        const manifest = await getAndroidManifest();
        if (!manifest) {
            request.log.warn({ manifestUrl: getAndroidManifestUrl() }, 'Android update manifest unavailable');
            reply.send({ update_required: false, update_url: null });
            return;
        }

        const updateRequired = shouldUpdateAndroid(manifest, {
            appId: app_id,
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
        });
    });
}
