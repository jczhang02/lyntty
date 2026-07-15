import { describe, expect, it, vi } from 'vitest';

import type { FileEventMessage, UserMessage } from '@/api/types';
import { bindPiRemoteInput, MAX_REMOTE_IMAGES_PER_MESSAGE } from './piRemoteInput';

function fileEvent(ref: string, mimeType = 'image/png'): FileEventMessage {
  return {
    role: 'session',
    content: {
      type: 'session',
      data: {
        id: `file-${ref}`,
        time: 1,
        role: 'user',
        ev: {
          t: 'file',
          ref,
          name: 'capture.png',
          size: 3,
          mimeType,
          image: { width: 10, height: 10 },
        },
      },
    },
  };
}

function userMessage(text: string, localKey: string): UserMessage {
  return {
    role: 'user',
    content: { type: 'text', text },
    localKey,
  };
}

function createSessionHarness(download: (ref: string) => Promise<Uint8Array | null>) {
  let onFileEvent: ((event: FileEventMessage) => void) | null = null;
  let onUserMessage: ((message: UserMessage) => void) | null = null;
  let pendingDownloads: Array<Promise<{ data: Uint8Array; mimeType: string; name: string } | null>> = [];

  const session = {
    onFileEvent(callback: (event: FileEventMessage) => void) {
      onFileEvent = callback;
    },
    onUserMessage(callback: (message: UserMessage) => void) {
      onUserMessage = callback;
    },
    downloadAndDecryptAttachment: download,
    trackAttachmentDownload(promise: Promise<{ data: Uint8Array; mimeType: string; name: string } | null>) {
      pendingDownloads.push(promise);
    },
    async drainAttachmentsForUserMessage() {
      const downloads = pendingDownloads;
      pendingDownloads = [];
      const results = await Promise.all(downloads);
      return results.filter((item): item is { data: Uint8Array; mimeType: string; name: string } => item !== null);
    },
  };

  return {
    session,
    emitFile: (event: FileEventMessage) => onFileEvent?.(event),
    emitMessage: (message: UserMessage) => onUserMessage?.(message),
  };
}

describe('bindPiRemoteInput', () => {
  it('binds file events to the next user message as Pi image content', async () => {
    const harness = createSessionHarness(async () => new Uint8Array([1, 2, 3]));
    const handle = vi.fn(async () => {});
    const binding = bindPiRemoteInput(harness.session, handle);

    harness.emitFile(fileEvent('ref-1'));
    harness.emitMessage(userMessage('inspect this', 'local-1'));
    await binding.flush();

    expect(handle).toHaveBeenCalledWith({
      message: userMessage('inspect this', 'local-1'),
      images: [{ type: 'image', data: 'AQID', mimeType: 'image/png' }],
    });
  });

  it('keeps consecutive attachment batches isolated while downloads settle', async () => {
    const harness = createSessionHarness(async (ref) => new Uint8Array([ref === 'first' ? 1 : 2]));
    const received: Array<{ key: string | undefined; data: string | undefined }> = [];
    const binding = bindPiRemoteInput(harness.session, async ({ message, images }) => {
      received.push({ key: message.localKey, data: images[0]?.data });
    });

    harness.emitFile(fileEvent('first'));
    harness.emitMessage(userMessage('one', 'local-1'));
    harness.emitFile(fileEvent('second'));
    harness.emitMessage(userMessage('two', 'local-2'));
    await binding.flush();

    expect(received).toEqual([
      { key: 'local-1', data: 'AQ==' },
      { key: 'local-2', data: 'Ag==' },
    ]);
  });

  it('rejects the whole command when an attachment cannot be delivered', async () => {
    const harness = createSessionHarness(async () => null);
    const handle = vi.fn(async () => {});
    const reject = vi.fn(async () => {});
    const binding = bindPiRemoteInput(harness.session, handle, vi.fn(), reject);

    harness.emitFile(fileEvent('bad'));
    harness.emitMessage(userMessage('do not send partial input', 'local-1'));
    await binding.flush();

    expect(handle).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledWith({
      message: userMessage('do not send partial input', 'local-1'),
      reason: expect.stringContaining('not delivered'),
    });
  });

  it('rejects non-image and oversized attachment batches before Pi delivery', async () => {
    const harness = createSessionHarness(async () => new Uint8Array([1]));
    const handle = vi.fn(async () => {});
    const reject = vi.fn(async () => {});
    const binding = bindPiRemoteInput(harness.session, handle, vi.fn(), reject);

    for (let index = 0; index <= MAX_REMOTE_IMAGES_PER_MESSAGE; index += 1) {
      harness.emitFile(fileEvent(`ref-${index}`));
    }
    harness.emitMessage(userMessage('too many', 'local-many'));
    harness.emitFile(fileEvent('not-image', 'application/pdf'));
    harness.emitMessage(userMessage('wrong type', 'local-type'));
    await binding.flush();

    expect(handle).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(2);
  });
});
