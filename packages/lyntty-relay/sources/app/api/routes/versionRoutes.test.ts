import fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { type Fastify } from "../types";
import { resetVersionRouteCacheForTests, shouldUpdateAndroid, versionRoutes } from "./versionRoutes";

const originalFetch = globalThis.fetch;

const manifest = {
    platform: "android" as const,
    appId: "dev.jczhang.lyntty",
    versionName: "1.7.1",
    versionCode: 178,
    apkUrl: "https://github.com/jczhang02/lyntty/releases/download/android-v1.7.1-178/lyntty-android-v1.7.1-178.apk",
    sha256: "a".repeat(64),
    notes: "test release",
};

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    versionRoutes(typed);
    await typed.ready();
    return typed;
}

describe("versionRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        resetVersionRouteCacheForTests();
        globalThis.fetch = mock(async () => ({
            ok: true,
            json: async () => manifest,
        })) as unknown as typeof fetch;
    });

    afterEach(async () => {
        await app?.close();
        globalThis.fetch = originalFetch;
        mock.restore();
        delete process.env.LYNTTY_ANDROID_UPDATE_MANIFEST_URL;
        delete process.env.LYNTTY_UPDATE_MANIFEST_CACHE_MS;
    });

    it("returns GitHub APK manifest fields when Android versionCode is stale", async () => {
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "android",
                app_id: "dev.jczhang.lyntty",
                version: "1.7.0",
                version_code: 177,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json() as unknown;
        expect(body).toEqual({
            update_required: true,
            version_name: "1.7.1",
            version_code: 178,
            apk_url: manifest.apkUrl,
            update_url: manifest.apkUrl,
            sha256: manifest.sha256,
            notes: "test release",
        });
    });

    it("returns no update for current Android versionCode", async () => {
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "android",
                app_id: "dev.jczhang.lyntty",
                version: "1.7.1",
                version_code: 178,
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json() as unknown;
        expect(body).toEqual({ update_required: false, update_url: null });
    });

    it("does not offer production APK to another app id", () => {
        expect(shouldUpdateAndroid(manifest, {
            appId: "dev.jczhang.lyntty.dev",
            version: "1.7.0",
            versionCode: 1,
        })).toBe(false);
    });

    it("ignores non-Android platforms", async () => {
        app = await createApp();

        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "ios",
                app_id: "dev.jczhang.lyntty",
                version: "1.7.0",
            },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json() as unknown;
        expect(body).toEqual({ update_required: false, update_url: null });
        expect(fetch).not.toHaveBeenCalled();
    });
});
