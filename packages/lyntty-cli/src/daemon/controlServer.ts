/**
 * HTTP control server for daemon management
 * Provides endpoints for listing sessions, stopping sessions, and daemon shutdown
 */

import fastify, { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { logger } from '@/ui/logger';
import { Metadata } from '@/api/types';
import { decodeBase64 } from '@/api/encryption';
import { TrackedSession, SessionEncryptionData } from './types';
import { SpawnSessionOptions, SpawnSessionResult } from '@/modules/common/registerCommonHandlers';
import type { LynttyPiCommandInfo, LynttyPiExtensionPayload, LynttyPiRemoteCommandAck, LynttyPiRemoteCommandEnvelope } from '@/pi/piExtensionEvent';

export function startDaemonControlServer({
  getChildren,
  stopSession,
  spawnSession,
  requestShutdown,
  onLynttySessionWebhook,
  onPiExtensionEvent,
  pollPiExtensionCommands,
  onPiExtensionCommandAck,
  piExtensionToken,
}: {
  getChildren: () => TrackedSession[];
  stopSession: (sessionId: string) => boolean;
  spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
  requestShutdown: () => void;
  onLynttySessionWebhook: (sessionId: string, metadata: Metadata, encryption?: SessionEncryptionData) => void;
  onPiExtensionEvent?: (payload: LynttyPiExtensionPayload) => Promise<{ status: 'ok'; sessionId?: string } | { status: 'error'; error: string }>;
  pollPiExtensionCommands?: (session: LynttyPiExtensionPayload['session'], afterSeq: number) => Promise<{ status: 'ok'; commands: LynttyPiRemoteCommandEnvelope[] } | { status: 'error'; error: string }>;
  onPiExtensionCommandAck?: (session: LynttyPiExtensionPayload['session'], ack: LynttyPiRemoteCommandAck) => Promise<{ status: 'ok' } | { status: 'error'; error: string }>;
  piExtensionToken?: string;
}): Promise<{ port: number; stop: () => Promise<void> }> {
  return new Promise((resolve) => {
    const app = fastify({
      logger: false // We use our own logger
    });

    // Set up Zod type provider
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>();

    const requirePiExtensionAuth = (request: { headers: Record<string, string | string[] | undefined> }, reply: { code: (statusCode: 401) => unknown }): boolean => {
      if (!piExtensionToken) return true;
      const raw = request.headers['x-lyntty-extension-token'];
      const token = Array.isArray(raw) ? raw[0] : raw;
      if (token === piExtensionToken) return true;
      reply.code(401);
      return false;
    };

    // Session reports itself after creation
    typed.post('/session-started', {
      schema: {
        body: z.object({
          sessionId: z.string(),
          metadata: z.any(),
          encryption: z.object({
            encryptionKey: z.string(),
            encryptionVariant: z.enum(['legacy', 'dataKey']),
            seq: z.number(),
            metadataVersion: z.number(),
            agentStateVersion: z.number(),
          }).optional()
        }),
        response: {
          200: z.object({
            status: z.literal('ok')
          })
        }
      }
    }, async (request) => {
      const { sessionId, metadata, encryption } = request.body;

      logger.debug(`[CONTROL SERVER] Session started: ${sessionId}`);

      let encryptionData: SessionEncryptionData | undefined;
      if (encryption) {
        encryptionData = {
          encryptionKey: decodeBase64(encryption.encryptionKey),
          encryptionVariant: encryption.encryptionVariant,
          seq: encryption.seq,
          metadataVersion: encryption.metadataVersion,
          agentStateVersion: encryption.agentStateVersion,
        };
      }

      onLynttySessionWebhook(sessionId, metadata, encryptionData);

      return { status: 'ok' as const };
    });

    const PI_EXTENSION_ID_MAX = 512;
    const PI_EXTENSION_TEXT_MAX = 50_000;
    const PiExtensionPayloadSchema = z.object({
      session: z.object({
        piSessionId: z.string().min(1).max(PI_EXTENSION_ID_MAX),
        sessionFile: z.string().max(4096).optional(),
        cwd: z.string().max(4096).optional(),
        name: z.string().max(512).optional(),
      }),
      event: z.record(z.string(), z.unknown()),
      eventId: z.number().int().positive().optional(),
      timestamp: z.number().optional(),
    });

    const PiExtensionSessionSchema = z.object({
      piSessionId: z.string().min(1).max(PI_EXTENSION_ID_MAX),
      sessionFile: z.string().max(4096).optional(),
      cwd: z.string().max(4096).optional(),
      name: z.string().max(512).optional(),
    });

    const PiCommandInfoSchema: z.ZodType<LynttyPiCommandInfo> = z.object({
      name: z.string().min(1).max(256),
      description: z.string().max(1024).optional(),
      source: z.string().min(1).max(64),
      sourceInfo: z.record(z.string(), z.unknown()).optional(),
    });

    const PiRemoteCommandSchema = z.discriminatedUnion('type', [
      z.object({ type: z.literal('send_user_message'), text: z.string().min(1).max(PI_EXTENSION_TEXT_MAX) }),
      z.object({ type: z.literal('follow_up'), text: z.string().min(1).max(PI_EXTENSION_TEXT_MAX) }),
      z.object({ type: z.literal('steer'), text: z.string().min(1).max(PI_EXTENSION_TEXT_MAX) }),
      z.object({ type: z.literal('abort') }),
      z.object({ type: z.literal('compact'), instructions: z.string().max(PI_EXTENSION_TEXT_MAX).optional() }),
      z.object({ type: z.literal('reload') }),
      z.object({ type: z.literal('set_session_name'), name: z.string().min(1).max(512) }),
      z.object({ type: z.literal('get_commands') }),
      z.object({ type: z.literal('invoke_pi_command'), commandLine: z.string().min(1).max(PI_EXTENSION_TEXT_MAX), deliverAs: z.enum(['followUp']).optional() }),
      z.object({ type: z.literal('set_label'), entryId: z.string().min(1).max(PI_EXTENSION_ID_MAX), label: z.string().max(512).optional() }),
    ]);

    typed.post('/pi-extension/status', {
      schema: {
        body: z.object({ session: z.any().optional() }).optional(),
        response: {
          200: z.object({ status: z.literal('ok') }),
          401: z.object({ status: z.literal('error'), error: z.string() }),
        }
      }
    }, async (request, reply) => {
      if (!requirePiExtensionAuth(request, reply)) return { status: 'error' as const, error: 'unauthorized' };
      return { status: 'ok' as const };
    });

    typed.post('/pi-extension/event', {
      schema: {
        body: PiExtensionPayloadSchema,
        response: {
          200: z.object({ status: z.literal('ok'), sessionId: z.string().optional() }),
          401: z.object({ status: z.literal('error'), error: z.string() }),
          500: z.object({ status: z.literal('error'), error: z.string() }),
        }
      }
    }, async (request, reply) => {
      if (!requirePiExtensionAuth(request, reply)) {
        return { status: 'error' as const, error: 'unauthorized' };
      }
      if (!onPiExtensionEvent) {
        return { status: 'ok' as const };
      }
      const result = await onPiExtensionEvent(request.body);
      if (result.status === 'error') {
        reply.code(500);
      }
      return result;
    });

    typed.post('/pi-extension/commands', {
      schema: {
        body: z.object({
          session: PiExtensionSessionSchema,
          afterSeq: z.number().int().nonnegative().optional(),
        }),
        response: {
          200: z.object({
            status: z.literal('ok'),
            commands: z.array(z.object({
              seq: z.number().int().positive(),
              deliveryToken: z.string().min(1).max(256),
              localKey: z.string().min(1).max(256).optional(),
              mobileContext: z.boolean().optional(),
              command: PiRemoteCommandSchema,
            })),
          }),
          401: z.object({ status: z.literal('error'), error: z.string() }),
          500: z.object({ status: z.literal('error'), error: z.string() }),
        }
      }
    }, async (request, reply) => {
      if (!requirePiExtensionAuth(request, reply)) {
        return { status: 'error' as const, error: 'unauthorized' };
      }
      if (!pollPiExtensionCommands) {
        return { status: 'ok' as const, commands: [] };
      }
      const result = await pollPiExtensionCommands(request.body.session, request.body.afterSeq ?? 0);
      if (result.status === 'error') {
        reply.code(500);
      }
      return result;
    });

    typed.post('/pi-extension/command-ack', {
      schema: {
        body: z.object({
          session: PiExtensionSessionSchema,
          ack: z.object({
            seq: z.number().int().positive(),
            status: z.enum(['delivered_to_pi_extension', 'accepted_by_pi', 'failed']),
            deliveryToken: z.string().min(1).max(256).optional(),
            error: z.string().max(2048).optional(),
            resultText: z.string().max(20_000).optional(),
            commands: z.array(PiCommandInfoSchema).max(500).optional(),
          }),
        }),
        response: {
          200: z.object({ status: z.literal('ok') }),
          401: z.object({ status: z.literal('error'), error: z.string() }),
          500: z.object({ status: z.literal('error'), error: z.string() }),
        }
      }
    }, async (request, reply) => {
      if (!requirePiExtensionAuth(request, reply)) {
        return { status: 'error' as const, error: 'unauthorized' };
      }
      if (!onPiExtensionCommandAck) {
        return { status: 'ok' as const };
      }
      const result = await onPiExtensionCommandAck(request.body.session, request.body.ack);
      if (result.status === 'error') {
        reply.code(500);
      }
      return result;
    });

    // List all tracked sessions
    typed.post('/list', {
      schema: {
        response: {
          200: z.object({
            children: z.array(z.object({
              startedBy: z.string(),
              lynttySessionId: z.string(),
              pid: z.number()
            }))
          })
        }
      }
    }, async () => {
      const children = getChildren();
      logger.debug(`[CONTROL SERVER] Listing ${children.length} sessions`);
      return {
        children: children
          .filter(child => child.lynttySessionId !== undefined)
          .map(child => ({
            startedBy: child.startedBy,
            lynttySessionId: child.lynttySessionId!,
            pid: child.pid
          }))
      }
    });

    // Stop specific session
    typed.post('/stop-session', {
      schema: {
        body: z.object({
          sessionId: z.string()
        }),
        response: {
          200: z.object({
            success: z.boolean()
          })
        }
      }
    }, async (request) => {
      const { sessionId } = request.body;

      logger.debug(`[CONTROL SERVER] Stop session request: ${sessionId}`);
      const success = stopSession(sessionId);
      return { success };
    });

    // Spawn new session
    typed.post('/spawn-session', {
      schema: {
        body: z.object({
          directory: z.string(),
          sessionId: z.string().optional(),
          agent: z.enum(['pi']).optional(),
          takeoverChoice: z.enum(['wait', 'stop', 'interrupt']).optional(),
          environmentVariables: z.record(z.string(), z.string()).optional(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            sessionId: z.string().optional(),
            approvedNewDirectoryCreation: z.boolean().optional()
          }),
          409: z.object({
            success: z.boolean(),
            requiresUserApproval: z.boolean().optional(),
            actionRequired: z.string().optional(),
            directory: z.string().optional()
          }),
          500: z.object({
            success: z.boolean(),
            error: z.string().optional()
          })
        }
      }
    }, async (request, reply) => {
      const { directory, sessionId, agent, takeoverChoice, environmentVariables } = request.body;

      logger.debug(`[CONTROL SERVER] Spawn session request: dir=${directory}, sessionId=${sessionId || 'new'}, agent=${agent || 'default'}, takeoverChoice=${takeoverChoice || 'none'}`);
      const result = await spawnSession({ directory, sessionId, agent, takeoverChoice, environmentVariables });

      switch (result.type) {
        case 'success':
          // Check if sessionId exists, if not return error
          if (!result.sessionId) {
            reply.code(500);
            return {
              success: false,
              error: 'Failed to spawn session: no session ID returned'
            };
          }
          return {
            success: true,
            sessionId: result.sessionId,
            approvedNewDirectoryCreation: true
          };

        case 'requestToApproveDirectoryCreation':
          reply.code(409); // Conflict - user input needed
          return {
            success: false,
            requiresUserApproval: true,
            actionRequired: 'CREATE_DIRECTORY',
            directory: result.directory
          };

        case 'error':
          reply.code(500);
          return {
            success: false,
            error: result.errorMessage
          };
      }
    });

    // Stop daemon
    typed.post('/stop', {
      schema: {
        response: {
          200: z.object({
            status: z.string()
          })
        }
      }
    }, async () => {
      logger.debug('[CONTROL SERVER] Stop daemon request received');

      // Give time for response to arrive
      setTimeout(() => {
        logger.debug('[CONTROL SERVER] Triggering daemon shutdown');
        requestShutdown();
      }, 50);

      return { status: 'stopping' };
    });

    app.listen({ port: 0, host: '127.0.0.1' }, (err, address) => {
      if (err) {
        logger.debug('[CONTROL SERVER] Failed to start:', err);
        throw err;
      }

      const port = parseInt(address.split(':').pop()!);
      logger.debug(`[CONTROL SERVER] Started on port ${port}`);

      resolve({
        port,
        stop: async () => {
          logger.debug('[CONTROL SERVER] Stopping server');
          await app.close();
          logger.debug('[CONTROL SERVER] Server stopped');
        }
      });
    });
  });
}
