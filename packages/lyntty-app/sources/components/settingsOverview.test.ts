import { describe, expect, it } from 'bun:test';
import { formatSettingsNodeSubtitle, formatSettingsServerSubtitle } from './settingsOverview';

describe('settings overview helpers', () => {
    it('formats server URL as a compact host', () => {
        expect(formatSettingsServerSubtitle('http://10.0.2.2:3005')).toBe('10.0.2.2:3005');
        expect(formatSettingsServerSubtitle('not-a-url')).toBe('not-a-url');
    });

    it('summarizes paired node status without diagnostics detail', () => {
        expect(formatSettingsNodeSubtitle(0, 0)).toBe('No nodes paired');
        expect(formatSettingsNodeSubtitle(1, 1)).toBe('1 node online');
        expect(formatSettingsNodeSubtitle(1, 3)).toBe('1/3 nodes online');
    });

    it('accepts localized node labels', () => {
        expect(formatSettingsNodeSubtitle(0, 0, {
            noNodesPaired: '未配对节点',
            oneNodeOnline: '1 个节点在线',
            nodesOnline: (onlineCount, totalCount) => `${onlineCount}/${totalCount} 个节点在线`,
        })).toBe('未配对节点');
        expect(formatSettingsNodeSubtitle(2, 5, {
            noNodesPaired: '未配对节点',
            oneNodeOnline: '1 个节点在线',
            nodesOnline: (onlineCount, totalCount) => `${onlineCount}/${totalCount} 个节点在线`,
        })).toBe('2/5 个节点在线');
    });
});
