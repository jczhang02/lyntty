export function shouldCheckForUpdates(isDev: boolean, updatesEnabled: boolean): boolean {
    return !isDev && updatesEnabled;
}
