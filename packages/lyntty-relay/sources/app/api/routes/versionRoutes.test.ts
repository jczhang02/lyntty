import fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { compatibilityBomFileBytes } from "lyntty-wire/compatibility";
import { createSignedCompatibilityBomFixture } from "lyntty-wire/compatibility/testing";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { type Fastify } from "../types";
import { resetVersionRouteCacheForTests, shouldUpdateAndroid, versionRoutes } from "./versionRoutes";

const originalFetch = globalThis.fetch;

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    versionRoutes(typed);
    await typed.ready();
    return typed;
}

function jsonResponse(value: unknown): Response {
    return new Response(JSON.stringify(value), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

function installSignedBomFetch(fixture: ReturnType<typeof createSignedCompatibilityBomFixture>) {
    globalThis.fetch = mock(async (input: string | URL | Request) => {
        const url = String(input);
        return url.endsWith('.sig.json')
            ? jsonResponse(fixture.signature)
            : new Response(compatibilityBomFileBytes(fixture.bom), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
}

describe("versionRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        resetVersionRouteCacheForTests();
        const fixture = createSignedCompatibilityBomFixture({
            sequence: 3,
            appVersion: '1.7.1',
            appVersionCode: 178,
        });
        process.env.LYNTTY_RELEASE_TRUST_ROOTS = JSON.stringify(fixture.trustStore);
        installSignedBomFetch(fixture);
    });

    afterEach(async () => {
        await app?.close();
        globalThis.fetch = originalFetch;
        mock.restore();
        delete process.env.LYNTTY_RELEASE_TRUST_ROOTS;
        delete process.env.LYNTTY_STABLE_BOM_URL;
        delete process.env.LYNTTY_STABLE_BOM_SIGNATURE_URL;
        delete process.env.LYNTTY_PREVIEW_BOM_URL;
        delete process.env.LYNTTY_PREVIEW_BOM_SIGNATURE_URL;
        delete process.env.LYNTTY_STABLE_MINIMUM_BOM_SEQUENCE;
        delete process.env.LYNTTY_PREVIEW_MINIMUM_BOM_SEQUENCE;
        delete process.env.LYNTTY_BOM_CACHE_MS;
    });

    it("returns APK fields only after verifying the signed stable BOM", async () => {
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
        expect(response.json()).toMatchObject({
            update_required: true,
            version_name: "1.7.1",
            version_code: 178,
            release_channel: "stable",
            bom_release_id: 'stable-3',
            bom_sequence: 3,
            bom_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        });
        expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("returns no update for the current Android versionCode", async () => {
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
        expect(response.json() as unknown).toEqual({ update_required: false, update_url: null });
    });

    it("does not offer a stable APK to another app identity", () => {
        expect(shouldUpdateAndroid({
            appId: "dev.jczhang.lyntty",
            releaseChannel: "stable",
            versionName: "1.7.1",
            versionCode: 178,
        }, {
            appId: "dev.jczhang.lyntty.preview",
            releaseChannel: "preview",
            version: "1.7.0",
            versionCode: 1,
        })).toBe(false);
    });

    it("uses separate trust, URL, package, signer, and image policy for preview", async () => {
        const fixture = createSignedCompatibilityBomFixture({
            sequence: 7,
            channel: 'preview',
            appVersion: '1.8.0-preview.1',
            appVersionCode: 200,
        });
        process.env.LYNTTY_RELEASE_TRUST_ROOTS = JSON.stringify(fixture.trustStore);
        process.env.LYNTTY_PREVIEW_BOM_URL = "https://example.invalid/preview-bom.json";
        installSignedBomFetch(fixture);
        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "android",
                app_id: "dev.jczhang.lyntty.preview",
                release_channel: "preview",
                version: "1.7.0",
                version_code: 177,
            },
        });
        expect(response.json()).toMatchObject({
            update_required: true,
            release_channel: "preview",
            version_name: '1.8.0-preview.1',
            bom_sequence: 7,
        });
    });

    it("does not fall back from preview to the stable BOM", async () => {
        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: {
                platform: "android",
                app_id: "dev.jczhang.lyntty.preview",
                release_channel: "preview",
                version_code: 1,
            },
        });
        expect(response.json() as unknown).toEqual({ update_required: false, update_url: null });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("fails closed when BOM content is tampered after signing", async () => {
        const fixture = createSignedCompatibilityBomFixture({ sequence: 4, appVersionCode: 190 });
        fixture.bom.components.app.android.versionCode = 999;
        installSignedBomFetch(fixture);
        app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/version',
            payload: { platform: 'android', app_id: 'dev.jczhang.lyntty', version_code: 1 },
        });
        expect(response.json() as unknown).toEqual({ update_required: false, update_url: null });
    });

    it("fails closed when a signed BOM is not encoded as canonical file bytes", async () => {
        const fixture = createSignedCompatibilityBomFixture({ sequence: 5, appVersionCode: 191 });
        globalThis.fetch = mock(async (input: string | URL | Request) => new Response(
            String(input).endsWith('.sig.json')
                ? JSON.stringify(fixture.signature)
                : `${JSON.stringify(fixture.bom, null, 2)}\n`,
        )) as unknown as typeof fetch;
        app = await createApp();
        const response = await app.inject({
            method: 'POST', url: '/v1/version',
            payload: { platform: 'android', app_id: 'dev.jczhang.lyntty', version_code: 1 },
        });
        expect(response.json() as unknown).toEqual({ update_required: false, update_url: null });
    });

    it("rejects a lower signed sequence after accepting a newer BOM", async () => {
        process.env.LYNTTY_BOM_CACHE_MS = '0';
        const newest = createSignedCompatibilityBomFixture({ sequence: 5, appVersionCode: 200 });
        const replay = createSignedCompatibilityBomFixture({ sequence: 4, appVersionCode: 999 });
        let current = newest;
        globalThis.fetch = mock(async (input: string | URL | Request) => {
            const url = String(input);
            return jsonResponse(url.endsWith('.sig.json') ? current.signature : current.bom);
        }) as unknown as typeof fetch;
        app = await createApp();
        const request = (versionCode: number) => app.inject({
            method: 'POST',
            url: '/v1/version',
            payload: { platform: 'android', app_id: 'dev.jczhang.lyntty', version_code: versionCode },
        });
        expect((await request(200)).json() as unknown).toEqual({ update_required: false, update_url: null });
        current = replay;
        expect((await request(200)).json() as unknown).toEqual({ update_required: false, update_url: null });
    });

    it("ignores non-Android platforms without fetching release metadata", async () => {
        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v1/version",
            payload: { platform: "ios", app_id: "dev.jczhang.lyntty", version: "1.7.0" },
        });
        expect(response.json() as unknown).toEqual({ update_required: false, update_url: null });
        expect(fetch).not.toHaveBeenCalled();
    });
});
