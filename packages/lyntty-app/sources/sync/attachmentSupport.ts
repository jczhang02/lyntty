export type ImageAttachmentFlavor = string | null | undefined;

export type ImageAttachmentSendPlan = {
    supportsAttachments: boolean;
    shouldUseAttachments: boolean;
    shouldShowUnsupportedAlert: boolean;
    shouldSendText: boolean;
};

export function isCompleteImageAttachmentUpload(opts: {
    requested: number;
    uploaded: number;
    failed: number;
}): boolean {
    return opts.requested > 0
        && opts.failed === 0
        && opts.uploaded === opts.requested;
}

export function supportsImageAttachmentsForFlavor(flavor: ImageAttachmentFlavor): boolean {
    return !flavor || flavor === 'pi';
}

export function getImageAttachmentSendPlan(opts: {
    flavor: ImageAttachmentFlavor;
    text: string;
    attachmentCount: number;
}): ImageAttachmentSendPlan {
    const hasAttachments = opts.attachmentCount > 0;
    const supportsAttachments = supportsImageAttachmentsForFlavor(opts.flavor);
    const shouldShowUnsupportedAlert = hasAttachments && !supportsAttachments;

    return {
        supportsAttachments,
        shouldUseAttachments: hasAttachments && supportsAttachments,
        shouldShowUnsupportedAlert,
        shouldSendText: !shouldShowUnsupportedAlert || opts.text.trim().length > 0,
    };
}
