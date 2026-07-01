import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fastify } from "../types";
import * as privacyKit from "privacy-kit";

const { state, dbMock, emitUpdateMock, resetState } = vi.hoisted(() => {
    type ArtifactRecord = {
        id: string;
        accountId: string;
        header: Buffer;
        headerVersion: number;
        body: Buffer;
        bodyVersion: number;
        dataEncryptionKey: Buffer;
        seq: number;
        createdAt: Date;
        updatedAt: Date;
    };

    const state = {
        artifacts: [] as ArtifactRecord[],
        nowMs: 1700000000000,
    };

    const resetState = () => {
        state.artifacts = [];
        state.nowMs = 1700000000000;
    };

    const selectFields = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) => {
        if (!select) return { ...row };
        const picked: Record<string, unknown> = {};
        for (const [key, enabled] of Object.entries(select)) {
            if (enabled) picked[key] = row[key];
        }
        return picked;
    };

    const artifactFindUnique = vi.fn(async (args: any) => {
        const row = state.artifacts.find((artifact) => artifact.id === args?.where?.id);
        return row ? selectFields(row as unknown as Record<string, unknown>, args?.select) : null;
    });

    const artifactCreate = vi.fn(async (args: any) => {
        const createdAt = new Date(state.nowMs);
        const row: ArtifactRecord = {
            ...args.data,
            createdAt,
            updatedAt: createdAt,
        };
        state.nowMs += 1;
        state.artifacts.push(row);
        return row;
    });

    const dbMock = {
        artifact: {
            findUnique: artifactFindUnique,
            create: artifactCreate,
        },
        account: {
            update: vi.fn(async () => ({ seq: 1 })),
        },
    };

    return { state, dbMock, emitUpdateMock: vi.fn(), resetState };
});

vi.mock("@/storage/db", () => ({ db: dbMock }));
vi.mock("@/utils/randomKeyNaked", () => ({ randomKeyNaked: vi.fn(() => "update-id") }));
vi.mock("@/app/events/eventRouter", () => ({
    eventRouter: { emitUpdate: emitUpdateMock },
    buildNewArtifactUpdate: vi.fn((artifact: unknown, seq: number, id: string) => ({ id, seq, body: artifact, createdAt: Date.now() })),
    buildUpdateArtifactUpdate: vi.fn(),
    buildDeleteArtifactUpdate: vi.fn(),
}));

import { artifactsRoutes } from "./artifactsRoutes";

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    typed.decorate("authenticate", async (request: any, reply: any) => {
        const userId = request.headers["x-user-id"];
        if (typeof userId !== "string") {
            return reply.code(401).send({ error: "Unauthorized" });
        }
        request.userId = userId;
    });

    artifactsRoutes(typed);
    await typed.ready();
    return typed;
}

function b64(text: string) {
    return privacyKit.encodeBase64(Buffer.from(text));
}

describe("artifactsRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        resetState();
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await app?.close();
    });

    it("keeps create idempotent only for identical artifact payloads", async () => {
        app = await createApp();
        const payload = {
            id: "00000000-0000-4000-8000-000000000001",
            header: b64("header"),
            body: b64("body"),
            dataEncryptionKey: b64("key"),
        };

        const first = await app.inject({ method: "POST", url: "/v1/artifacts", headers: { "x-user-id": "user-1" }, payload });
        const second = await app.inject({ method: "POST", url: "/v1/artifacts", headers: { "x-user-id": "user-1" }, payload });

        expect(first.statusCode).toBe(200);
        expect(second.statusCode).toBe(200);
        expect(state.artifacts).toHaveLength(1);
        expect(emitUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("rejects same-account artifact id reuse with different encrypted content", async () => {
        app = await createApp();
        const payload = {
            id: "00000000-0000-4000-8000-000000000001",
            header: b64("header"),
            body: b64("body"),
            dataEncryptionKey: b64("key"),
        };

        await app.inject({ method: "POST", url: "/v1/artifacts", headers: { "x-user-id": "user-1" }, payload });
        const conflict = await app.inject({
            method: "POST",
            url: "/v1/artifacts",
            headers: { "x-user-id": "user-1" },
            payload: { ...payload, body: b64("different") },
        });

        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toEqual({ error: "Artifact with this ID already exists with different content" });
        expect(state.artifacts).toHaveLength(1);
    });

    it("rejects oversized artifact fields before decode", async () => {
        app = await createApp();
        const oversized = await app.inject({
            method: "POST",
            url: "/v1/artifacts",
            headers: { "x-user-id": "user-1" },
            payload: {
                id: "00000000-0000-4000-8000-000000000001",
                header: "a".repeat(5_000_001),
                body: b64("body"),
                dataEncryptionKey: b64("key"),
            },
        });

        expect([400, 413]).toContain(oversized.statusCode);
    });
});
