export type SettingsNodeSubtitleLabels = {
    noNodesPaired: string;
    oneNodeOnline: string;
    nodesOnline: (onlineCount: number, totalCount: number) => string;
};

const defaultNodeLabels: SettingsNodeSubtitleLabels = {
    noNodesPaired: 'No nodes paired',
    oneNodeOnline: '1 node online',
    nodesOnline: (onlineCount, totalCount) => `${onlineCount}/${totalCount} nodes online`,
};

export function formatSettingsServerSubtitle(serverUrl: string): string {
    try {
        const url = new URL(serverUrl);
        return url.host;
    } catch {
        return serverUrl;
    }
}

export function formatSettingsNodeSubtitle(
    onlineCount: number,
    totalCount: number,
    labels: SettingsNodeSubtitleLabels = defaultNodeLabels,
): string {
    if (totalCount === 0) {
        return labels.noNodesPaired;
    }
    if (onlineCount === 1 && totalCount === 1) {
        return labels.oneNodeOnline;
    }
    return labels.nodesOnline(onlineCount, totalCount);
}
