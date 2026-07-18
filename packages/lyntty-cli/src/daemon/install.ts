import { isDaemonRunningExpectedRelease, checkIfDaemonRunningAndCleanupStaleState, stopDaemon } from './controlClient';
import { createDaemonServiceManager } from './service';
import { embeddedBuildIdentity } from '@/distribution/embeddedBuild';
import { resolveInstallPaths } from '@/distribution/installPaths';
import { readInstallState } from '@/distribution/installState';
import { readCredentials } from '@/persistence';

async function waitForExactManagedDaemon(releaseId: string): Promise<void> {
    const manager = createDaemonServiceManager();
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (await manager.status() === 'running' && await isDaemonRunningExpectedRelease(releaseId)) return;
        await Bun.sleep(100);
    }
    throw new Error(`managed lynttyd ${releaseId} did not become healthy within 15 seconds`);
}

export async function install(): Promise<void> {
    if (!await readCredentials()) {
        throw new Error('Authenticate first with `lyntty auth login`; lynttyd service installation is non-interactive.');
    }
    const paths = resolveInstallPaths();
    const state = await readInstallState(paths.statePath);
    const embedded = embeddedBuildIdentity();
    if (!state || !embedded.releaseId || embedded.releaseId !== state.currentReleaseId) {
        throw new Error('Daemon service repair requires the current transactionally installed release; run the verified release installer first.');
    }

    const manager = createDaemonServiceManager();
    const previousServiceState = await manager.status();
    if (previousServiceState === 'not-installed' && await checkIfDaemonRunningAndCleanupStaleState()) {
        await stopDaemon();
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline && await checkIfDaemonRunningAndCleanupStaleState()) await Bun.sleep(100);
        if (await checkIfDaemonRunningAndCleanupStaleState()) {
            throw new Error('Legacy unmanaged lynttyd did not stop; refusing to install a competing user service');
        }
    }

    try {
        await manager.install();
        await manager.restart();
        await waitForExactManagedDaemon(state.currentReleaseId);
    } catch (error) {
        if (previousServiceState === 'not-installed') await manager.uninstall().catch(() => undefined);
        else if (previousServiceState === 'stopped') await manager.stop().catch(() => undefined);
        throw error;
    }
    console.log(`Installed and verified lynttyd ${manager.kind} for ${state.currentReleaseId}.`);
}
