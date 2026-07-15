import { Modal } from '@/modal';
import type { PiResumeTakeoverChoice } from '@/sync/ops';
import { t } from '@/text';

/**
 * Keep the safe wait path one tap away while putting stop/interrupt behind a
 * second explicit confirmation. Cancelling either prompt performs no takeover.
 */
export function requestPiResumeTakeoverChoice(): Promise<PiResumeTakeoverChoice | null> {
    return new Promise((resolve) => {
        Modal.alert(
            t('sessionInfo.resumeSession'),
            t('sessionInfo.resumeTakeoverPrompt'),
            [
                { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
                { text: t('sessionInfo.resumeWait'), onPress: () => resolve('wait') },
                {
                    text: t('sessionInfo.resumeTakeOver'),
                    onPress: () => {
                        Modal.alert(
                            t('sessionInfo.resumeSession'),
                            t('sessionInfo.resumeTakeoverPrompt'),
                            [
                                { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
                                { text: t('sessionInfo.resumeStop'), style: 'destructive', onPress: () => resolve('stop') },
                                { text: t('sessionInfo.resumeInterrupt'), style: 'destructive', onPress: () => resolve('interrupt') },
                            ],
                        );
                    },
                },
            ],
        );
    });
}
