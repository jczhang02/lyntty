import { describe, expect, it } from 'bun:test';

import {
    getImageAttachmentSendPlan,
    isCompleteImageAttachmentUpload,
    supportsImageAttachmentsForFlavor,
} from './attachmentSupport';

describe('supportsImageAttachmentsForFlavor', () => {
    it('supports only explicit Pi sessions', () => {
        expect(supportsImageAttachmentsForFlavor('pi')).toBe(true);
        expect(supportsImageAttachmentsForFlavor(' PI ')).toBe(true);
    });

    it('rejects unidentified, non-Pi, and unknown flavors', () => {
        expect(supportsImageAttachmentsForFlavor(undefined)).toBe(false);
        expect(supportsImageAttachmentsForFlavor(null)).toBe(false);
        expect(supportsImageAttachmentsForFlavor('claude')).toBe(false);
        expect(supportsImageAttachmentsForFlavor('codex')).toBe(false);
        expect(supportsImageAttachmentsForFlavor('gemini')).toBe(false);
        expect(supportsImageAttachmentsForFlavor('openclaw')).toBe(false);
        expect(supportsImageAttachmentsForFlavor('custom-agent')).toBe(false);
    });
});

describe('isCompleteImageAttachmentUpload', () => {
    it('accepts only a complete attachment batch', () => {
        expect(isCompleteImageAttachmentUpload({ requested: 2, uploaded: 2, failed: 0 })).toBe(true);
        expect(isCompleteImageAttachmentUpload({ requested: 2, uploaded: 1, failed: 1 })).toBe(false);
        expect(isCompleteImageAttachmentUpload({ requested: 2, uploaded: 2, failed: 1 })).toBe(false);
        expect(isCompleteImageAttachmentUpload({ requested: 0, uploaded: 0, failed: 0 })).toBe(false);
    });
});

describe('getImageAttachmentSendPlan', () => {
    it('uses attachments and sends text for Pi', () => {
        expect(getImageAttachmentSendPlan({
            flavor: 'pi',
            text: '',
            attachmentCount: 1,
        })).toEqual({
            supportsAttachments: true,
            shouldUseAttachments: true,
            shouldShowUnsupportedAlert: false,
            shouldSendText: true,
        });
    });

    it('warns but still sends non-empty text for unsupported agents', () => {
        expect(getImageAttachmentSendPlan({
            flavor: 'gemini',
            text: 'describe this',
            attachmentCount: 1,
        })).toEqual({
            supportsAttachments: false,
            shouldUseAttachments: false,
            shouldShowUnsupportedAlert: true,
            shouldSendText: true,
        });
    });

    it('warns and sends nothing for unsupported image-only messages', () => {
        expect(getImageAttachmentSendPlan({
            flavor: 'openclaw',
            text: '   ',
            attachmentCount: 2,
        })).toEqual({
            supportsAttachments: false,
            shouldUseAttachments: false,
            shouldShowUnsupportedAlert: true,
            shouldSendText: false,
        });
    });
});
