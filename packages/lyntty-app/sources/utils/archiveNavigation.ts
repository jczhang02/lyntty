import type { Router } from 'expo-router';

export function navigateAfterSessionArchive(router: Pick<Router, 'replace'>) {
    router.replace('/');
}
