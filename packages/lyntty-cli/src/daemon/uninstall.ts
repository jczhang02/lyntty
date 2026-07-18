import { createDaemonServiceManager } from './service';

export async function uninstall(): Promise<void> {
    const manager = createDaemonServiceManager();
    await manager.uninstall();
    console.log(`Removed the lynttyd ${manager.kind} service.`);
    console.log('Lyntty state, credentials, sessions, and the Pi extension were preserved.');
}
