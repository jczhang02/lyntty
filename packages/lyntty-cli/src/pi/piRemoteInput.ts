import type { ApiSessionClient } from '@/api/apiSession';
import { encodeBase64 } from '@/api/encryption';
import type { FileEventMessage, UserMessage } from '@/api/types';

export type PiRemoteImage = {
  type: 'image';
  data: string;
  mimeType: string;
};

export type PiRemoteInput = {
  message: UserMessage;
  images: PiRemoteImage[];
};

type PiRemoteInputSession = Pick<
  ApiSessionClient,
  | 'onFileEvent'
  | 'onUserMessage'
  | 'downloadAndDecryptAttachment'
  | 'trackAttachmentDownload'
  | 'drainAttachmentsForUserMessage'
>;

export type PiRemoteInputBinding = {
  flush: () => Promise<void>;
};

export type PiRemoteInputRejection = {
  message: UserMessage;
  reason: string;
};

export const MAX_REMOTE_IMAGES_PER_MESSAGE = 20;
export const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REMOTE_IMAGE_BATCH_BYTES = 40 * 1024 * 1024;

const ATTACHMENT_FAILURE_REASON = 'Image attachment could not be loaded. Message was not delivered; retry the message.';
const ATTACHMENT_LIMIT_REASON = 'Image attachment limits were exceeded. Message was not delivered; remove images and retry.';

/**
 * Associate each ordered relay file event with the next user-text envelope.
 * Downloads begin immediately, while user messages are delivered serially so
 * a slow image cannot reorder two phone commands.
 */
export function bindPiRemoteInput(
  session: PiRemoteInputSession,
  handle: (input: PiRemoteInput) => void | Promise<void>,
  onError: (error: unknown) => void = () => {},
  onRejected: (rejection: PiRemoteInputRejection) => void | Promise<void> = () => {},
): PiRemoteInputBinding {
  let deliveryChain = Promise.resolve();
  let pendingAttachmentCount = 0;
  let pendingDeclaredBytes = 0;
  let pendingRejectionReason: string | null = null;

  session.onFileEvent((fileEvent: FileEventMessage) => {
    const event = fileEvent.content.data.ev;
    const mimeType = event.mimeType ?? 'image/jpeg';
    pendingAttachmentCount += 1;
    pendingDeclaredBytes += event.size;

    if (!mimeType.startsWith('image/')) {
      pendingRejectionReason = ATTACHMENT_FAILURE_REASON;
      return;
    }
    if (pendingAttachmentCount > MAX_REMOTE_IMAGES_PER_MESSAGE
      || event.size > MAX_REMOTE_IMAGE_BYTES
      || pendingDeclaredBytes > MAX_REMOTE_IMAGE_BATCH_BYTES) {
      pendingRejectionReason = ATTACHMENT_LIMIT_REASON;
      return;
    }

    const download = (async () => {
      try {
        const data = await session.downloadAndDecryptAttachment(event.ref);
        return data ? { data, mimeType, name: event.name } : null;
      } catch (error) {
        onError(error);
        return null;
      }
    })();
    session.trackAttachmentDownload(download);
  });

  session.onUserMessage((message: UserMessage) => {
    // Atomically claim the current bucket and its limits before a later file
    // event can leak into this command.
    const expectedCount = pendingAttachmentCount;
    const rejectedBeforeDownload = pendingRejectionReason;
    pendingAttachmentCount = 0;
    pendingDeclaredBytes = 0;
    pendingRejectionReason = null;
    const attachments = session.drainAttachmentsForUserMessage();
    deliveryChain = deliveryChain.then(async () => {
      const downloaded = await attachments;
      const downloadedBytes = downloaded.reduce((total, attachment) => total + attachment.data.byteLength, 0);
      const rejectionReason = rejectedBeforeDownload
        ?? (downloaded.length !== expectedCount ? ATTACHMENT_FAILURE_REASON : null)
        ?? (downloaded.some((attachment) => attachment.data.byteLength > MAX_REMOTE_IMAGE_BYTES)
          || downloadedBytes > MAX_REMOTE_IMAGE_BATCH_BYTES
          ? ATTACHMENT_LIMIT_REASON
          : null);
      if (rejectionReason) {
        await onRejected({ message, reason: rejectionReason });
        return;
      }
      await handle({
        message,
        images: downloaded.map((attachment) => ({
          type: 'image' as const,
          data: encodeBase64(attachment.data),
          mimeType: attachment.mimeType,
        })),
      });
    }).catch(onError);
  });

  return {
    flush: () => deliveryChain,
  };
}
