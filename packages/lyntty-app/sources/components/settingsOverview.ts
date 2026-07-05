export function formatSettingsServerSubtitle(serverUrl: string): string {
    try {
        const url = new URL(serverUrl);
        return url.host;
    } catch {
        return serverUrl;
    }
}

export function formatSettingsNodeSubtitle(onlineCount: number, totalCount: number): string {
    if (totalCount === 0) {
        return 'No nodes paired';
    }
    if (onlineCount === 1 && totalCount === 1) {
        return '1 node online';
    }
    return `${onlineCount}/${totalCount} nodes online`;
}
