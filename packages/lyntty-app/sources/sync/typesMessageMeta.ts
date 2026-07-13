import { z } from 'zod';

// Shared message metadata schema
export const MessageMetaSchema = z.object({
    sentFrom: z.string().optional(), // Source identifier
    permissionMode: z.string().optional(), // Permission mode key for this message
    model: z.string().nullable().optional(), // Model name for this message (null = reset)
    fallbackModel: z.string().nullable().optional(), // Fallback model for this message (null = reset)
    customSystemPrompt: z.string().nullable().optional(), // Custom system prompt for this message (null = reset)
    appendSystemPrompt: z.string().nullable().optional(), // Append to system prompt for this message (null = reset)
    allowedTools: z.array(z.string()).nullable().optional(), // Allowed tools for this message (null = reset)
    disallowedTools: z.array(z.string()).nullable().optional(), // Disallowed tools for this message (null = reset)
    effort: z.string().nullable().optional(), // Reasoning / thinking effort for this message (null = reset)
    displayText: z.string().optional(), // Optional text to display in UI instead of actual message text
    remoteCommandLocalKey: z.string().optional(), // Local optimistic user message id for Pi shared-control echo merging
    sendMobileContextToPi: z.boolean().optional(), // Whether this remote command asked Pi to receive mobile context
    remoteCommandState: z.enum(['queued', 'accepted_by_pi', 'failed']).optional(),
});

export type MessageMeta = z.infer<typeof MessageMetaSchema>;
