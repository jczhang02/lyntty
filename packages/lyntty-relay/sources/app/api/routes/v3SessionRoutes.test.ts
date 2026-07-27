import fastify from "fastify";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { type Fastify } from "../types";

type SessionRecord = {
    id: string;
    accountId: string;
    tag: string;
    seq: number;
    createdAt: Date;
    active: boolean;
    lastActiveAt: Date;
    updatedAt: Date;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: Uint8Array | null;
};

type MessageRecord = {
    id: string;
    sessionId: string;
    seq: number;
    localId: string | null;
    content: unknown;
    createdAt: Date;
    updatedAt: Date;
};

const {
    state,
    emitUpdateMock,
    dbMock,
    resetState,
    seedSession,
    seedMessage
} = (() => {
    const state = {
        sessions: [] as SessionRecord[],
        messages: [] as MessageRecord[],
        accountSeqById: new Map<string, number>(),
        nextMessageId: 1,
        nowMs: 1700000000000
    };

    const resetState = () => {
        state.sessions = [];
        state.messages = [];
        state.accountSeqById = new Map<string, number>();
        state.nextMessageId = 1;
        state.nowMs = 1700000000000;
    };

    const seedSession = (input: Partial<SessionRecord> & Pick<SessionRecord, "id" | "accountId">) => {
        state.sessions.push({
            id: input.id,
            accountId: input.accountId,
            tag: input.tag ?? `tag:${input.id}`,
            seq: input.seq ?? 0,
            createdAt: input.createdAt ?? new Date(state.nowMs),
            active: input.active ?? false,
            lastActiveAt: input.lastActiveAt ?? new Date(state.nowMs),
            updatedAt: input.updatedAt ?? new Date(state.nowMs),
            metadata: input.metadata ?? "encrypted-metadata",
            metadataVersion: input.metadataVersion ?? 1,
            agentState: input.agentState ?? null,
            agentStateVersion: input.agentStateVersion ?? 0,
            dataEncryptionKey: input.dataEncryptionKey ?? null,
        });
        if (!state.accountSeqById.has(input.accountId)) {
            state.accountSeqById.set(input.accountId, 0);
        }
    };

    const seedMessage = (input: {
        sessionId: string;
        seq: number;
        localId: string | null;
        content: unknown;
    }) => {
        const createdAt = new Date(state.nowMs);
        state.nowMs += 1;
        const msg: MessageRecord = {
            id: `seed-${state.nextMessageId}`,
            sessionId: input.sessionId,
            seq: input.seq,
            localId: input.localId,
            content: input.content,
            createdAt,
            updatedAt: createdAt
        };
        state.nextMessageId += 1;
        state.messages.push(msg);
    };

    const selectFields = <T extends Record<string, unknown>>(row: T, select?: Record<string, boolean>) => {
        if (!select) {
            return { ...row };
        }
        const picked: Record<string, unknown> = {};
        for (const [key, enabled] of Object.entries(select)) {
            if (enabled) {
                picked[key] = row[key];
            }
        }
        return picked;
    };

    const sessionFindFirst = mock(async (args: any) => {
        const row = state.sessions.find((session) => (
            session.id === args?.where?.id &&
            session.accountId === args?.where?.accountId
        ));
        if (!row) {
            return null;
        }
        return selectFields(row as unknown as Record<string, unknown>, args?.select) as SessionRecord;
    });

    const sessionFindMany = mock(async (args: any) => {
        const rows = state.sessions
            .filter((session) => session.accountId === args?.where?.accountId)
            .slice(0, args?.take);
        return rows.map((row) => selectFields(row as unknown as Record<string, unknown>, args?.select));
    });

    const sessionUpdate = mock(async (args: any) => {
        const session = state.sessions.find((item) => item.id === args?.where?.id);
        if (!session) {
            throw new Error("Session not found");
        }
        const increment = args?.data?.seq?.increment ?? 0;
        session.seq += increment;
        if (typeof args?.data?.active === "boolean") {
            session.active = args.data.active;
        }
        if (args?.data?.lastActiveAt instanceof Date) {
            session.lastActiveAt = args.data.lastActiveAt;
        }
        if (args?.data?.updatedAt instanceof Date) {
            session.updatedAt = args.data.updatedAt;
        }
        return selectFields(session as unknown as Record<string, unknown>, args?.select);
    });

    const accountUpdate = mock(async (args: any) => {
        const accountId = args?.where?.id as string;
        const current = state.accountSeqById.get(accountId) ?? 0;
        const increment = args?.data?.seq?.increment ?? 0;
        const next = current + increment;
        state.accountSeqById.set(accountId, next);
        return selectFields({ seq: next }, args?.select);
    });

    const sessionMessageFindMany = mock(async (args: any) => {
        let rows = [...state.messages];

        if (args?.where?.sessionId) {
            rows = rows.filter((message) => message.sessionId === args.where.sessionId);
        }
        if (typeof args?.where?.seq?.gt === "number") {
            rows = rows.filter((message) => message.seq > args.where.seq.gt);
        }
        if (typeof args?.where?.seq?.lt === "number") {
            rows = rows.filter((message) => message.seq < args.where.seq.lt);
        }
        if (Array.isArray(args?.where?.localId?.in)) {
            const localIds = new Set(args.where.localId.in);
            rows = rows.filter((message) => localIds.has(message.localId));
        }
        if (args?.orderBy?.seq === "asc") {
            rows.sort((a, b) => a.seq - b.seq);
        }
        if (args?.orderBy?.seq === "desc") {
            rows.sort((a, b) => b.seq - a.seq);
        }
        if (args?.orderBy?.createdAt === "desc") {
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        if (typeof args?.take === "number") {
            rows = rows.slice(0, args.take);
        }

        return rows.map((row) => selectFields(row as unknown as Record<string, unknown>, args?.select));
    });

    const sessionMessageCreate = mock(async (args: any) => {
        const createdAt = new Date(state.nowMs);
        state.nowMs += 1;
        const row: MessageRecord = {
            id: `msg-${state.nextMessageId}`,
            sessionId: args?.data?.sessionId,
            seq: args?.data?.seq,
            localId: args?.data?.localId ?? null,
            content: args?.data?.content,
            createdAt,
            updatedAt: createdAt
        };
        state.nextMessageId += 1;
        state.messages.push(row);
        return selectFields(row as unknown as Record<string, unknown>, args?.select);
    });

    const txClient = {
        session: {
            update: sessionUpdate
        },
        sessionMessage: {
            findMany: sessionMessageFindMany,
            create: sessionMessageCreate
        },
        account: {
            update: accountUpdate
        }
    };

    const dbMock = {
        session: {
            findFirst: sessionFindFirst,
            findMany: sessionFindMany,
            update: sessionUpdate
        },
        account: {
            update: accountUpdate
        },
        sessionMessage: {
            findMany: sessionMessageFindMany,
            create: sessionMessageCreate
        },
        $transaction: mock(async (fn: any) => fn(txClient))
    };

    const emitUpdateMock = mock();

    return {
        state,
        emitUpdateMock,
        dbMock,
        resetState,
        seedSession,
        seedMessage
    };
})();

mock.module("@/storage/db", () => ({
    db: dbMock
}));

mock.module("@/utils/randomKeyNaked", () => ({
    randomKeyNaked: mock(() => "update-id")
}));

mock.module("@/app/events/eventRouter", () => ({
    eventRouter: {
        emitUpdate: emitUpdateMock
    },
    buildNewMessageUpdate: mock((message: unknown, sessionId: string, updateSeq: number, updateId: string) => ({
        id: updateId,
        seq: updateSeq,
        body: {
            t: "new-message",
            sid: sessionId,
            message
        },
        createdAt: Date.now()
    })),
    buildNewSessionUpdate: mock(),
    buildSessionActivityEphemeral: mock(),
}));

mock.module("@/app/session/sessionDelete", () => ({
    sessionDelete: mock(),
}));

import { v3SessionRoutes } from "./v3SessionRoutes";
import { sessionRoutes } from "./sessionRoutes";

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;

    typed.decorate("authenticate", (request: any, reply: any, done: () => void) => {
        const userId = request.headers["x-user-id"];
        if (typeof userId !== "string") {
            reply.code(401).send({ error: "Unauthorized" });
            return;
        }
        request.userId = userId;
        done();
    });

    v3SessionRoutes(typed);
    sessionRoutes(typed);
    await typed.ready();
    return typed;
}

describe("v3SessionRoutes", () => {
    let app: Fastify;

    beforeEach(() => {
        resetState();
        emitUpdateMock.mockClear();
    });

    afterEach(async () => {
        if (app) {
            await app.close();
        }
    });

    it("reads messages in seq order from the beginning", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 2, localId: "l2", content: { t: "encrypted", c: "b" } });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.hasMore).toBe(false);
        expect(body.messages.map((message: any) => message.seq)).toEqual([1, 2]);
    });

    it("returns stable session tags for Pi discovery reconciliation", async () => {
        seedSession({ id: "session-1", accountId: "user-1", tag: "pi:stable-tag" });

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v1/sessions",
            headers: { "x-user-id": "user-1" }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().sessions[0]).toMatchObject({
            id: "session-1",
            tag: "pi:stable-tag"
        });
    });

    it("supports cursor pagination with hasMore", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        for (let seq = 1; seq <= 5; seq += 1) {
            seedMessage({ sessionId: "session-1", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        const page1 = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=0&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body1 = page1.json();
        expect(body1.messages.map((message: any) => message.seq)).toEqual([1, 2]);
        expect(body1.hasMore).toBe(true);

        const page2 = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=2&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body2 = page2.json();
        expect(body2.messages.map((message: any) => message.seq)).toEqual([3, 4]);
        expect(body2.hasMore).toBe(true);

        const page3 = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=4&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body3 = page3.json();
        expect(body3.messages.map((message: any) => message.seq)).toEqual([5]);
        expect(body3.hasMore).toBe(false);
    });

    it("supports backward pagination with before_seq returning newest first", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        for (let seq = 1; seq <= 5; seq += 1) {
            seedMessage({ sessionId: "session-1", seq, localId: `l${seq}`, content: { t: "encrypted", c: String(seq) } });
        }

        app = await createApp();
        // No before_seq cursor → ask for the latest page.
        // Use Number.MAX_SAFE_INTEGER as the upper bound so the server returns
        // the newest messages first without the client needing to know the
        // current max seq.
        const latest = await app.inject({
            method: "GET",
            url: `/v3/sessions/session-1/messages?before_seq=${Number.MAX_SAFE_INTEGER}&limit=2`,
            headers: { "x-user-id": "user-1" }
        });
        expect(latest.statusCode).toBe(200);
        const body1 = latest.json();
        expect(body1.messages.map((message: any) => message.seq)).toEqual([5, 4]);
        expect(body1.hasMore).toBe(true);

        // Cursor backward from the lowest seq returned in the previous page.
        const older = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?before_seq=4&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body2 = older.json();
        expect(body2.messages.map((message: any) => message.seq)).toEqual([3, 2]);
        expect(body2.hasMore).toBe(true);

        // Final page: only seq=1 remains.
        const oldest = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?before_seq=2&limit=2",
            headers: { "x-user-id": "user-1" }
        });
        const body3 = oldest.json();
        expect(body3.messages.map((message: any) => message.seq)).toEqual([1]);
        expect(body3.hasMore).toBe(false);
    });

    it("rejects requests that combine after_seq and before_seq", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const response = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=0&before_seq=10",
            headers: { "x-user-id": "user-1" }
        });
        expect(response.statusCode).toBe(400);
    });

    it("returns empty results for empty sessions and after_seq beyond latest", async () => {
        seedSession({ id: "session-1", accountId: "user-1" });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "l1", content: { t: "encrypted", c: "a" } });

        app = await createApp();
        const emptyResponse = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?after_seq=1",
            headers: { "x-user-id": "user-1" }
        });

        expect(emptyResponse.statusCode).toBe(200);
        const body = emptyResponse.json();
        expect(body.messages).toEqual([]);
        expect(body.hasMore).toBe(false);
    });

    it("enforces read query bounds and auth/session ownership", async () => {
        seedSession({ id: "session-1", accountId: "owner-user" });
        app = await createApp();

        const invalidLimit = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?limit=0",
            headers: { "x-user-id": "owner-user" }
        });
        expect(invalidLimit.statusCode).toBe(400);

        const tooLargeLimit = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages?limit=501",
            headers: { "x-user-id": "owner-user" }
        });
        expect(tooLargeLimit.statusCode).toBe(400);

        const unauthorized = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages"
        });
        expect(unauthorized.statusCode).toBe(401);

        const wrongOwner = await app.inject({
            method: "GET",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "another-user" }
        });
        expect(wrongOwner.statusCode).toBe(404);
    });

    it("sends a single message and emits a new-message update", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 0 });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "l1", content: "enc-content-1" }
                ]
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0].seq).toBe(1);
        expect(body.messages[0].localId).toBe("l1");

        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].content).toEqual({ t: "encrypted", c: "enc-content-1" });
        expect(state.sessions[0].active).toBe(true);
        expect(state.sessions[0].lastActiveAt.getTime()).toBe(state.messages[0].createdAt.getTime());
        expect(state.sessions[0].updatedAt.getTime()).toBe(state.messages[0].createdAt.getTime());
        expect(emitUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("sends multiple messages with sequential seq numbers", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 0 });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "l1", content: "enc-1" },
                    { localId: "l2", content: "enc-2" },
                    { localId: "l3", content: "enc-3" }
                ]
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.messages.map((message: any) => message.seq)).toEqual([1, 2, 3]);
        expect(emitUpdateMock).toHaveBeenCalledTimes(3);
    });

    it("deduplicates by localId and returns mixed existing/new messages sorted by seq", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 1 });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "existing", content: { t: "encrypted", c: "old" } });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "new-1", content: "new-content" },
                    { localId: "existing", content: "old" }
                ]
            }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.messages.map((message: any) => message.localId)).toEqual(["existing", "new-1"]);
        expect(body.messages.map((message: any) => message.seq)).toEqual([1, 2]);
        expect(state.messages).toHaveLength(2);
        expect(emitUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("rejects same localId with different encrypted content", async () => {
        seedSession({ id: "session-1", accountId: "user-1", seq: 1 });
        seedMessage({ sessionId: "session-1", seq: 1, localId: "existing", content: { t: "encrypted", c: "old" } });

        app = await createApp();
        const response = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "user-1" },
            payload: {
                messages: [
                    { localId: "existing", content: "changed" }
                ]
            }
        });

        expect(response.statusCode).toBe(409);
        expect(response.json() as unknown).toEqual({
            error: "localId content conflict",
            code: "LOCAL_ID_CONTENT_CONFLICT",
            localId: "existing"
        });
        expect(state.messages).toHaveLength(1);
        expect(emitUpdateMock).not.toHaveBeenCalled();
    });

    it("enforces send validation limits and auth/session ownership", async () => {
        seedSession({ id: "session-1", accountId: "owner-user" });
        app = await createApp();

        const emptyBatch = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "owner-user" },
            payload: { messages: [] }
        });
        expect(emptyBatch.statusCode).toBe(400);

        const overLimitBatch = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "owner-user" },
            payload: {
                messages: Array.from({ length: 101 }, (_, index) => ({
                    localId: `l-${index}`,
                    content: `enc-${index}`
                }))
            }
        });
        expect(overLimitBatch.statusCode).toBe(400);

        const oversizedContent = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "owner-user" },
            payload: {
                messages: [{ localId: "l1", content: "x".repeat(1_000_001) }]
            }
        });
        expect(oversizedContent.statusCode).toBe(400);

        const oversizedLocalId = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "owner-user" },
            payload: {
                messages: [{ localId: "l".repeat(241), content: "enc-1" }]
            }
        });
        expect(oversizedLocalId.statusCode).toBe(400);

        const unauthorized = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            payload: {
                messages: [{ localId: "l1", content: "enc-1" }]
            }
        });
        expect(unauthorized.statusCode).toBe(401);

        const wrongOwner = await app.inject({
            method: "POST",
            url: "/v3/sessions/session-1/messages",
            headers: { "x-user-id": "another-user" },
            payload: {
                messages: [{ localId: "l1", content: "enc-1" }]
            }
        });
        expect(wrongOwner.statusCode).toBe(404);
    });
});
