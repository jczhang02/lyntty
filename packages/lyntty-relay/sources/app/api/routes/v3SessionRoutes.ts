import { buildNewMessageUpdate, eventRouter } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { allocateSessionSeqBatch, allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { type Fastify } from "../types";

// Pagination contract:
//   - after_seq=N  → forward sync: messages with seq > N, ordered ASC.
//                    Used by the client to pull anything new since the highest
//                    seq it has already seen.
//   - before_seq=N → backward paging: messages with seq < N, ordered DESC.
//                    Used by the client to lazy-load older history when the
//                    user scrolls up, so opening a long session does not block
//                    on fetching the entire history first.
// The two are mutually exclusive. With neither, the route defaults to
// `after_seq=0` (forward from the start) for backward compatibility.
const getMessagesQuerySchema = z.object({
    after_seq: z.coerce.number().int().min(0).optional(),
    before_seq: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100)
}).refine(
    (data) => !(data.after_seq !== undefined && data.before_seq !== undefined),
    { message: "after_seq and before_seq are mutually exclusive" }
);

const MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH = 1_000_000;
const MAX_MESSAGE_LOCAL_ID_LENGTH = 240;

const sendMessagesBodySchema = z.object({
    messages: z.array(z.object({
        content: z.string().min(1).max(MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH),
        localId: z.string().min(1).max(MAX_MESSAGE_LOCAL_ID_LENGTH)
    })).min(1).max(100)
});

type SelectedMessage = {
    id: string;
    seq: number;
    content: unknown;
    localId: string | null;
    createdAt: Date;
    updatedAt: Date;
};

function isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toResponseMessage(message: SelectedMessage) {
    return {
        id: message.id,
        seq: message.seq,
        content: message.content,
        localId: message.localId,
        createdAt: message.createdAt.getTime(),
        updatedAt: message.updatedAt.getTime()
    };
}

function toSendResponseMessage(message: Omit<SelectedMessage, "content">) {
    return {
        id: message.id,
        seq: message.seq,
        localId: message.localId,
        createdAt: message.createdAt.getTime(),
        updatedAt: message.updatedAt.getTime()
    };
}

export function v3SessionRoutes(app: Fastify) {
    app.get('/v3/sessions/:sessionId/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string()
            }),
            querystring: getMessagesQuerySchema
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;
        const { after_seq, before_seq, limit } = request.query;

        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                accountId: userId
            },
            select: { id: true }
        });

        if (!session) {
            return reply.code(404).send({ error: 'Session not found' });
        }

        // Backward direction is opt-in via `before_seq`; everything else (no
        // params, or explicit `after_seq`) keeps the legacy forward semantics.
        const isBackward = before_seq !== undefined;
        const where = isBackward
            ? { sessionId, seq: { lt: before_seq } }
            : { sessionId, seq: { gt: after_seq ?? 0 } };
        const orderBy = isBackward
            ? { seq: 'desc' as const }
            : { seq: 'asc' as const };

        const messages = await db.sessionMessage.findMany({
            where,
            orderBy,
            take: limit + 1,
            select: {
                id: true,
                seq: true,
                content: true,
                localId: true,
                createdAt: true,
                updatedAt: true
            }
        });

        const hasMore = messages.length > limit;
        const page = hasMore ? messages.slice(0, limit) : messages;

        return reply.send({
            messages: page.map(toResponseMessage),
            hasMore
        });
    });

    app.post('/v3/sessions/:sessionId/messages', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                sessionId: z.string()
            }),
            body: sendMessagesBodySchema
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params;
        const { messages } = request.body;

        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                accountId: userId
            },
            select: { id: true }
        });

        if (!session) {
            return reply.code(404).send({ error: 'Session not found' });
        }

        const firstMessageByLocalId = new Map<string, { localId: string; content: string }>();
        for (const message of messages) {
            const existing = firstMessageByLocalId.get(message.localId);
            if (existing && existing.content !== message.content) {
                return reply.code(409).send({ error: 'localId content conflict' });
            }
            if (!existing) {
                firstMessageByLocalId.set(message.localId, message);
            }
        }

        const uniqueMessages = Array.from(firstMessageByLocalId.values());
        const contentByLocalId = new Map(uniqueMessages.map((message) => [message.localId, message.content]));

        const createOrFetchMessages = async () => db.$transaction(async (tx) => {
            const localIds = uniqueMessages.map((message) => message.localId);
            const existing = await tx.sessionMessage.findMany({
                where: {
                    sessionId,
                    localId: { in: localIds }
                },
                select: {
                    id: true,
                    seq: true,
                    content: true,
                    localId: true,
                    createdAt: true,
                    updatedAt: true
                }
            });

            const existingByLocalId = new Map<string, SelectedMessage>();
            for (const message of existing) {
                if (message.localId) {
                    const expectedContent = contentByLocalId.get(message.localId);
                    const existingContent = message.content as { t?: unknown; c?: unknown };
                    if (expectedContent !== undefined && existingContent?.c !== expectedContent) {
                        throw new Error(`localId content conflict: ${message.localId}`);
                    }
                    existingByLocalId.set(message.localId, message);
                }
            }

            const newMessages = uniqueMessages.filter((message) => !existingByLocalId.has(message.localId));
            const seqs = await allocateSessionSeqBatch(sessionId, newMessages.length, tx);

            const createdMessages: SelectedMessage[] = [];
            for (let i = 0; i < newMessages.length; i += 1) {
                const message = newMessages[i];
                const createdMessage = await tx.sessionMessage.create({
                    data: {
                        sessionId,
                        seq: seqs[i],
                        content: {
                            t: 'encrypted',
                            c: message.content
                        },
                        localId: message.localId
                    },
                    select: {
                        id: true,
                        seq: true,
                        content: true,
                        localId: true,
                        createdAt: true,
                        updatedAt: true
                    }
                });
                createdMessages.push(createdMessage);
            }

            if (createdMessages.length > 0) {
                const lastMessageTime = createdMessages.reduce((latest, message) => (
                    message.createdAt.getTime() > latest ? message.createdAt.getTime() : latest
                ), createdMessages[0].createdAt.getTime());
                await tx.session.update({
                    where: { id: sessionId },
                    data: {
                        updatedAt: new Date(lastMessageTime),
                        lastActiveAt: new Date(lastMessageTime),
                        active: true
                    }
                });
            }

            const responseMessages = [...existing, ...createdMessages].sort((a, b) => a.seq - b.seq);

            return {
                responseMessages,
                createdMessages
            };
        });

        let txResult: { responseMessages: SelectedMessage[]; createdMessages: SelectedMessage[] } | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                txResult = await createOrFetchMessages();
                break;
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('localId content conflict:')) {
                    return reply.code(409).send({ error: 'localId content conflict' });
                }
                if (!isUniqueConstraintError(error) || attempt === 2) {
                    throw error;
                }
            }
        }
        if (!txResult) {
            throw new Error('Failed to create messages');
        }

        for (const message of txResult.createdMessages) {
            const content = message.localId ? contentByLocalId.get(message.localId) : null;
            if (!content) {
                continue;
            }
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildNewMessageUpdate({
                ...message,
                content: {
                    t: 'encrypted',
                    c: content
                }
            }, sessionId, updSeq, randomKeyNaked(12));

            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'all-interested-in-session', sessionId }
            });
        }

        return reply.send({
            messages: txResult.responseMessages.map(toSendResponseMessage)
        });
    });
}
