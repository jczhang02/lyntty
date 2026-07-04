import * as z from 'zod';
import { sessionEnvelopeSchema } from './sessionProtocol';
import { MessageMetaSchema, type MessageMeta } from './messageMeta';
import { AgentMessageSchema, UserMessageSchema } from './legacyProtocol';
import { MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH, MAX_MESSAGE_LOCAL_ID_LENGTH } from './caps';

export { MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH, MAX_MESSAGE_LOCAL_ID_LENGTH } from './caps';

function withSerializedCap<T extends z.ZodTypeAny>(schema: T, maxBytes = MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH): T {
  return schema.refine((value) => JSON.stringify(value).length <= maxBytes, { message: 'wire payload too large' }) as T;
}

export const SessionMessageContentSchema = z.object({
  c: z.string().max(MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH),
  t: z.literal('encrypted'),
});
export type SessionMessageContent = z.infer<typeof SessionMessageContentSchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  seq: z.number().int().nonnegative(),
  localId: z.string().max(MAX_MESSAGE_LOCAL_ID_LENGTH).nullish(),
  content: SessionMessageContentSchema,
  createdAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;
export { MessageMetaSchema };
export type { MessageMeta };

export const SessionProtocolMessageSchema = z.object({
  role: z.literal('session'),
  content: sessionEnvelopeSchema,
  meta: MessageMetaSchema.optional(),
});
export type SessionProtocolMessage = z.infer<typeof SessionProtocolMessageSchema>;

export const MessageContentSchema = z.discriminatedUnion('role', [
  UserMessageSchema,
  AgentMessageSchema,
  SessionProtocolMessageSchema,
]);
export type MessageContent = z.infer<typeof MessageContentSchema>;

export const VersionedEncryptedValueSchema = z.object({
  version: z.number().int().nonnegative(),
  value: z.string().max(MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH),
});
export type VersionedEncryptedValue = z.infer<typeof VersionedEncryptedValueSchema>;

export const VersionedNullableEncryptedValueSchema = z.object({
  version: z.number().int().nonnegative(),
  value: z.string().max(MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH).nullable(),
});
export type VersionedNullableEncryptedValue = z.infer<typeof VersionedNullableEncryptedValueSchema>;

export const UpdateNewMessageBodySchema = z.object({
  t: z.literal('new-message'),
  sid: z.string(),
  message: SessionMessageSchema,
});
export type UpdateNewMessageBody = z.infer<typeof UpdateNewMessageBodySchema>;

export const UpdateSessionBodySchema = withSerializedCap(z.object({
  t: z.literal('update-session'),
  id: z.string(),
  metadata: VersionedEncryptedValueSchema.nullish(),
  agentState: VersionedNullableEncryptedValueSchema.nullish(),
}));
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>;

export const VersionedMachineEncryptedValueSchema = z.object({
  version: z.number().int().nonnegative(),
  value: z.string().max(MAX_ENCRYPTED_MESSAGE_CONTENT_LENGTH),
});
export type VersionedMachineEncryptedValue = z.infer<typeof VersionedMachineEncryptedValueSchema>;

export const UpdateMachineBodySchema = withSerializedCap(z.object({
  t: z.literal('update-machine'),
  machineId: z.string(),
  metadata: VersionedMachineEncryptedValueSchema.nullish(),
  daemonState: VersionedMachineEncryptedValueSchema.nullish(),
  active: z.boolean().optional(),
  activeAt: z.number().finite().nonnegative().optional(),
}));
export type UpdateMachineBody = z.infer<typeof UpdateMachineBodySchema>;

export const CoreUpdateBodySchema = z.discriminatedUnion('t', [
  UpdateNewMessageBodySchema,
  UpdateSessionBodySchema,
  UpdateMachineBodySchema,
]);
export type CoreUpdateBody = z.infer<typeof CoreUpdateBodySchema>;

export const CoreUpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number().int().nonnegative(),
  body: CoreUpdateBodySchema,
  createdAt: z.number().finite().nonnegative(),
});
export type CoreUpdateContainer = z.infer<typeof CoreUpdateContainerSchema>;

// Aliases used by existing consumers during migration.
export const ApiMessageSchema = SessionMessageSchema;
export type ApiMessage = SessionMessage;

export const ApiUpdateNewMessageSchema = UpdateNewMessageBodySchema;
export type ApiUpdateNewMessage = UpdateNewMessageBody;

export const ApiUpdateSessionStateSchema = UpdateSessionBodySchema;
export type ApiUpdateSessionState = UpdateSessionBody;

export const ApiUpdateMachineStateSchema = UpdateMachineBodySchema;
export type ApiUpdateMachineState = UpdateMachineBody;

export const UpdateBodySchema = UpdateNewMessageBodySchema;
export type UpdateBody = UpdateNewMessageBody;

export const UpdateSchema = CoreUpdateContainerSchema;
export type Update = CoreUpdateContainer;
