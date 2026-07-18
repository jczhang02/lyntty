import { describe, expect, it } from 'bun:test';
import { getNewSessionSidebarLayout } from './newSessionSidebarLayout';

describe('getNewSessionSidebarLayout', () => {
    it('enables the right sidebar on supported wide Mac Catalyst layouts', () => {
        expect(getNewSessionSidebarLayout({
            isMac: true,
            fileDiffsSidebarEnabled: true,
            zenMode: false,
            windowWidth: 1200,
        })).toEqual({
            canShowSidebar: true,
            showSidebar: true,
            sidebarWidth: 360,
        });
    });

    it('disables the sidebar when the setting is off', () => {
        expect(getNewSessionSidebarLayout({
            isMac: true,
            fileDiffsSidebarEnabled: false,
            zenMode: false,
            windowWidth: 1200,
        }).showSidebar).toBe(false);
    });

    it('disables the sidebar in zen mode', () => {
        expect(getNewSessionSidebarLayout({
            isMac: true,
            fileDiffsSidebarEnabled: true,
            zenMode: true,
            windowWidth: 1200,
        }).showSidebar).toBe(false);
    });

    it('disables the sidebar below the minimum width', () => {
        expect(getNewSessionSidebarLayout({
            isMac: true,
            fileDiffsSidebarEnabled: true,
            zenMode: false,
            windowWidth: 1099,
        }).showSidebar).toBe(false);
    });

    it('disables the sidebar on phones and tablets', () => {
        expect(getNewSessionSidebarLayout({
            isMac: false,
            fileDiffsSidebarEnabled: true,
            zenMode: false,
            windowWidth: 1400,
        }).showSidebar).toBe(false);
    });
});
