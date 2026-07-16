import { onShutdown } from "@/utils/shutdown";
import { Fastify } from "./types";
import { buildMachineActivityEphemeral, ClientConnection, eventRouter } from "@/app/events/eventRouter";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { Redis } from "ioredis";
import { log } from "@/utils/log";
import { auth } from "@/app/auth/auth";
import { isClientTypeAllowedByToken } from "@/app/auth/authScope";
import { getMetricsLabelsFromSocket, redisStreamLagMsGauge, websocketConnectionsGauge, websocketEventsCounter } from "../monitoring/metrics2";
import { rpcHandler } from "./socket/rpcHandler";
import { pingHandler } from "./socket/pingHandler";
import { sessionUpdateHandler } from "./socket/sessionUpdateHandler";
import { machineUpdateHandler } from "./socket/machineUpdateHandler";
import { db } from "@/storage/db";

const MAX_VISIBLE_SESSION_ID_LENGTH = 512;

function normalizeVisibleSessionId(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_VISIBLE_SESSION_ID_LENGTH) {
        return null;
    }
    return trimmed;
}

function applyAppPresence(socket: { data: Record<string, unknown> }, data: { state?: string; visibleSessionId?: unknown }) {
    const appState = data?.state === 'active' ? 'active' : 'background';
    socket.data.appState = appState;
    socket.data.visibleSessionId = appState === 'active'
        ? normalizeVisibleSessionId(data?.visibleSessionId)
        : null;
}

export function startSocket(app: Fastify) {
    const io = new Server(app.server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST", "OPTIONS"],
            credentials: true,
            allowedHeaders: ["*"]
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 45000,
        pingInterval: 15000,
        path: '/v1/updates',
        allowUpgrades: true,
        upgradeTimeout: 10000,
        connectTimeout: 20000,
        serveClient: false, // Don't serve the client files
        // Brief-disconnect event replay. Currently OFF to preserve parity with
        // pre-multi-process prod behavior — clients fall through to the full
        // REST re-fetch path on every reconnect (apiSocket.ts onReconnected
        // listener). Enabling this lets socket.io replay missed events from
        // the streams adapter (which implements restoreSession via the Redis
        // stream) so the client can skip the heavy refetch when
        // socket.recovered === true. Verified working cross-replica via
        // deploy/integration-tests/missed-events.mjs (event #2 fired during a
        // forced engine.close() arrived after auto-reconnect, recovered=true).
        // Ship parity first; turn this on as a follow-up.
        // connectionStateRecovery: {
        //     maxDisconnectionDuration: 2 * 60 * 1000,
        // },
    });

    // Multi-process support: attach Redis streams adapter when REDIS_URL is set
    if (process.env.REDIS_URL) {
        const streamClient = new Redis(process.env.REDIS_URL);
        io.adapter(createAdapter(streamClient, { maxLen: 200000, readCount: 2000 }));
        log({ module: 'websocket' }, 'Redis streams adapter enabled for multi-process support');

        // Track stream reader lag: wrap onRawMessage to capture last-read offset,
        // then periodically compare against stream HEAD.
        let lastReadOffset = "0-0";
        const adapter = io.of("/").adapter as any;
        const origOnRawMessage = adapter.onRawMessage.bind(adapter);
        adapter.onRawMessage = (msg: any, offset: string) => {
            lastReadOffset = offset;
            return origOnRawMessage(msg, offset);
        };
        setInterval(async () => {
            try {
                const info = await streamClient.xinfo("STREAM", "socket.io") as any[];
                const headId = String(info[info.indexOf("last-generated-id") + 1]);
                const headMs = parseInt(headId.split("-")[0]);
                const readMs = parseInt(lastReadOffset.split("-")[0]);
                redisStreamLagMsGauge.set(headMs - readMs);
            } catch { /* stream may not exist yet */ }
        }, 5000);
    }

    // Initialize event router with Socket.IO server instance
    eventRouter.init(io);

    // Auth runs in middleware so it completes BEFORE the client's `connect`
    // event fires. Without this, the async verifyToken in the connection
    // callback creates a window where client events (rpc-register, rpc-call)
    // arrive before handlers are attached — and get silently dropped.
    io.use(async (socket, next) => {
        const token = socket.handshake.auth.token as string;
        const clientType = socket.handshake.auth.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.handshake.auth.sessionId as string | undefined;
        const machineId = socket.handshake.auth.machineId as string | undefined;

        if (!token) {
            log({ module: 'websocket' }, `No token provided`);
            next(new Error('Missing authentication token'));
            return;
        }

        if (clientType === 'session-scoped' && !sessionId) {
            log({ module: 'websocket' }, `Session-scoped client missing sessionId`);
            next(new Error('Session ID required for session-scoped clients'));
            return;
        }

        if (clientType === 'machine-scoped' && !machineId) {
            log({ module: 'websocket' }, `Machine-scoped client missing machineId`);
            next(new Error('Machine ID required for machine-scoped clients'));
            return;
        }

        const verified = await auth.verifyToken(token);
        if (!verified) {
            log({ module: 'websocket' }, `Invalid token provided`);
            next(new Error('Invalid authentication token'));
            return;
        }

        const effectiveClientType = clientType || 'user-scoped';
        if (!isClientTypeAllowedByToken(verified.extras, effectiveClientType)) {
            log({ module: 'websocket' }, `Token scope rejected clientType: ${effectiveClientType}`);
            next(new Error('Token scope does not allow requested client type'));
            return;
        }

        if (effectiveClientType === 'session-scoped' && sessionId) {
            const session = await db.session.findFirst({
                where: { id: sessionId, accountId: verified.userId },
                select: { id: true }
            });
            if (!session) {
                log({ module: 'websocket' }, `Session-scoped client requested invalid session`);
                next(new Error('Session scope rejected'));
                return;
            }
        }

        if (effectiveClientType === 'machine-scoped' && machineId) {
            const machine = await db.machine.findFirst({
                where: { id: machineId, accountId: verified.userId },
                select: { id: true }
            });
            if (!machine) {
                log({ module: 'websocket' }, `Machine-scoped client requested invalid machine`);
                next(new Error('Machine scope rejected'));
                return;
            }
        }

        socket.data.userId = verified.userId;
        socket.data.clientType = clientType;
        socket.data.authExtras = verified.extras;
        socket.data.sessionId = sessionId;
        socket.data.machineId = machineId;
        socket.data.lynttyClient = socket.handshake.auth.lynttyClient as string
            || socket.handshake.headers['x-lyntty-client'] as string
            || undefined;
        next();
    });

    io.on("connection", (socket) => {
        const userId = socket.data.userId as string;
        const clientType = socket.data.clientType as 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
        const sessionId = socket.data.sessionId as string | undefined;
        const machineId = socket.data.machineId as string | undefined;
        const labels = getMetricsLabelsFromSocket(socket);

        log({ module: 'websocket' }, `Token verified: ${userId}, clientType: ${clientType || 'user-scoped'}, client: ${labels.client}, sessionId: ${sessionId || 'none'}, machineId: ${machineId || 'none'}, socketId: ${socket.id}`);

        // Store connection based on type
        const metadata = { clientType: clientType || 'user-scoped', sessionId, machineId };
        const lynttyClient = socket.data.lynttyClient as string | undefined;
        let connection: ClientConnection;
        if (metadata.clientType === 'session-scoped' && sessionId) {
            connection = {
                connectionType: 'session-scoped',
                socket,
                userId,
                sessionId,
                lynttyClient
            };
        } else if (metadata.clientType === 'machine-scoped' && machineId) {
            connection = {
                connectionType: 'machine-scoped',
                socket,
                userId,
                machineId,
                lynttyClient
            };
        } else {
            connection = {
                connectionType: 'user-scoped',
                socket,
                userId,
                lynttyClient
            };
        }
        eventRouter.addConnection(userId, connection);
        websocketConnectionsGauge.inc({ type: connection.connectionType, ...labels });

        // Broadcast daemon online status
        if (connection.connectionType === 'machine-scoped') {
            // Broadcast daemon online
            const connectedAt = Date.now();
            db.machine.updateMany({
                where: { accountId: userId, id: connection.machineId },
                data: { active: true, lastActiveAt: new Date(connectedAt) }
            }).catch((error) => {
                log({ module: 'websocket', level: 'error' }, `Error marking machine online: ${error}`);
            });
            const machineActivity = buildMachineActivityEphemeral(machineId!, true, connectedAt);
            eventRouter.emitEphemeral({
                userId,
                payload: machineActivity,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        // Track app focus + visible Session Remote for push notification routing.
        // State lives on socket.data — no external storage needed.
        // Read initial state from handshake to close the race window before
        // the first async app-state event.
        applyAppPresence(socket, {
            state: socket.handshake.auth.appState as string | undefined,
            visibleSessionId: socket.handshake.auth.visibleSessionId,
        });

        socket.on('app-state', (data: { state?: string; visibleSessionId?: unknown }) => {
            applyAppPresence(socket, data);
        });

        socket.on('disconnect', () => {
            websocketEventsCounter.inc({ event_type: 'disconnect', ...labels });

            // Cleanup connections
            eventRouter.removeConnection(userId, connection);
            websocketConnectionsGauge.dec({ type: connection.connectionType, ...labels });

            log({ module: 'websocket' }, `User disconnected: ${userId}`);

            // Broadcast daemon offline status
            if (connection.connectionType === 'machine-scoped') {
                const disconnectedAt = Date.now();
                const offlineCheckTimer = setTimeout(() => {
                    eventRouter.hasMachineSocket(userId, connection.machineId).then((hasMachineSocket) => {
                        if (hasMachineSocket) {
                            return;
                        }
                        db.machine.updateMany({
                            where: {
                                accountId: userId,
                                id: connection.machineId,
                                lastActiveAt: { lte: new Date(disconnectedAt) }
                            },
                            data: { active: false, lastActiveAt: new Date(disconnectedAt) }
                        }).then((result) => {
                            if (result.count === 0) {
                                return;
                            }
                            const machineActivity = buildMachineActivityEphemeral(connection.machineId, false, disconnectedAt);
                            eventRouter.emitEphemeral({
                                userId,
                                payload: machineActivity,
                                recipientFilter: { type: 'user-scoped-only' }
                            });
                        }).catch((error) => {
                            log({ module: 'websocket', level: 'error' }, `Error marking machine offline: ${error}`);
                        });
                    }).catch((error) => {
                        log({ module: 'websocket', level: 'error' }, `Error checking machine sockets: ${error}`);
                    });
                }, 100);
                (offlineCheckTimer as unknown as { unref?: () => void }).unref?.();
            }
        });

        // Handlers
        rpcHandler(userId, socket, io);
        sessionUpdateHandler(userId, socket, connection);
        pingHandler(socket);
        machineUpdateHandler(userId, socket, connection);

        // Ready
        log({ module: 'websocket' }, `User connected: ${userId}`);
    });

    onShutdown('api', async () => {
        await io.close();
    });
}
