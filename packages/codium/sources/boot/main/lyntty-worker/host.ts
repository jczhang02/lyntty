import { app, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import type {
    LynttyStateSnapshot,
    LynttyWorkerMessage,
    LynttyWorkerRequest,
    LynttyWorkerRequestWithId,
} from '../../../shared/lyntty-protocol'
import { storageFilePath } from '../app-storage'

const __dirname = dirname(fileURLToPath(import.meta.url))

type PendingRequest = {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

const DEFAULT_SERVER_URL = 'https://api.cluster-fluster.com'
const DEFAULT_WEBAPP_URL = 'https://app.lyntty.engineering'

let worker: Worker | null = null
let latestState: LynttyStateSnapshot = {
    status: 'starting',
    serverUrl: process.env.LYNTTY_SERVER_URL || DEFAULT_SERVER_URL,
    webappUrl: process.env.LYNTTY_WEBAPP_URL || DEFAULT_WEBAPP_URL,
    clientReady: false,
    updatedAt: Date.now(),
}
const pending = new Map<string, PendingRequest>()

function workerEntryPath(): string {
    const p = join(__dirname, 'lyntty-worker.js')
    if (!existsSync(p)) {
        // eslint-disable-next-line no-console
        console.error('[lyntty-host] worker bundle missing at', p)
    }
    return p
}

function ensureWorker(): Worker {
    if (worker) return worker
    const w = new Worker(workerEntryPath(), {
        workerData: {
            storagePath: storageFilePath('lyntty-auth.json'),
            serverUrl: process.env.LYNTTY_SERVER_URL || DEFAULT_SERVER_URL,
            webappUrl: process.env.LYNTTY_WEBAPP_URL || DEFAULT_WEBAPP_URL,
            clientId: `codium/${app.getVersion() || '0.0.0'}`,
        },
    })
    w.on('message', (msg: LynttyWorkerMessage) => {
        if (msg.kind === 'state') {
            latestState = msg.state
            broadcastState()
            return
        }
        if (msg.kind === 'response') {
            latestState = msg.state
            broadcastState()
            const entry = pending.get(msg.requestId)
            if (!entry) return
            pending.delete(msg.requestId)
            if (msg.ok) {
                entry.resolve({ state: msg.state, value: msg.value })
            } else {
                entry.reject(new Error(msg.error))
            }
            return
        }
        if (msg.kind === 'fatal') {
            // eslint-disable-next-line no-console
            console.error('[lyntty-worker] fatal:', msg.error)
        }
    })
    w.on('error', (err) => {
        // eslint-disable-next-line no-console
        console.error('[lyntty-worker] error:', err)
        failPending(err.message || 'Lyntty worker crashed')
        latestState = {
            ...latestState,
            status: 'error',
            clientReady: false,
            error: err.message || 'Lyntty worker crashed',
            updatedAt: Date.now(),
        }
        broadcastState()
        worker = null
    })
    w.on('exit', (code) => {
        if (code !== 0) {
            const message = `Lyntty worker exited with code ${code}`
            // eslint-disable-next-line no-console
            console.error('[lyntty-worker]', message)
            failPending(message)
            latestState = {
                ...latestState,
                status: 'error',
                clientReady: false,
                error: message,
                updatedAt: Date.now(),
            }
            broadcastState()
        }
        worker = null
    })
    worker = w
    return w
}

function failPending(reason: string): void {
    for (const entry of pending.values()) {
        entry.reject(new Error(reason))
    }
    pending.clear()
}

function broadcastState(): void {
    for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('lyntty:state', latestState)
    }
}

function sendRequest(request: LynttyWorkerRequest): Promise<unknown> {
    const requestId = randomUUID()
    const msg: LynttyWorkerRequestWithId = { ...request, requestId }
    const w = ensureWorker()
    return new Promise((resolve, reject) => {
        pending.set(requestId, { resolve, reject })
        w.postMessage(msg)
    })
}

export function registerLynttyIpc(): void {
    ipcMain.handle('lyntty:state:get', async () => {
        const result = await sendRequest({ kind: 'getState' }) as { state: LynttyStateSnapshot }
        return result.state
    })
    ipcMain.handle('lyntty:create-account', async () => {
        const result = await sendRequest({ kind: 'createAccount' }) as { state: LynttyStateSnapshot }
        return result.state
    })
    ipcMain.handle('lyntty:start-link-device', async () => {
        const result = await sendRequest({ kind: 'startLinkDevice' }) as { state: LynttyStateSnapshot }
        return result.state
    })
    ipcMain.handle('lyntty:restore-secret', async (_e, secretKey: string) => {
        const result = await sendRequest({ kind: 'restoreSecret', secretKey }) as { state: LynttyStateSnapshot }
        return result.state
    })
    ipcMain.handle('lyntty:cancel-auth', async () => {
        const result = await sendRequest({ kind: 'cancelAuth' }) as { state: LynttyStateSnapshot }
        return result.state
    })
    ipcMain.handle('lyntty:logout', async () => {
        const result = await sendRequest({ kind: 'logout' }) as { state: LynttyStateSnapshot }
        return result.state
    })
    ipcMain.handle('lyntty:client-status', async () => {
        const result = await sendRequest({ kind: 'clientStatus' }) as {
            state: LynttyStateSnapshot
            value?: unknown
        }
        return result.value
    })
    app.on('before-quit', () => {
        try {
            worker?.terminate()
        } catch {
            /* ignored */
        }
        worker = null
    })
}
