import { useSyncExternalStore } from 'react'
import type {
    LynttyAuthenticatedClientStatus,
    LynttyStateSnapshot,
} from '@/shared/lyntty-protocol'

const initialState: LynttyStateSnapshot = {
    status: 'starting',
    serverUrl: '',
    webappUrl: '',
    clientReady: false,
    updatedAt: Date.now(),
}

let snapshot = initialState
let unsubscribeIpc: (() => void) | null = null
let initialized = false
const listeners = new Set<() => void>()

function emit(next: LynttyStateSnapshot): void {
    snapshot = next
    for (const listener of listeners) listener()
}

function setError(message: string): void {
    emit({
        ...snapshot,
        status: 'error',
        error: message,
        updatedAt: Date.now(),
    })
}

function ensureStarted(): void {
    if (initialized) return
    initialized = true
    try {
        unsubscribeIpc = window.lyntty.onState(emit)
        void window.lyntty.getState().then(emit).catch((err) => {
            setError(err instanceof Error ? err.message : String(err))
        })
    } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
    }
}

export const lynttyClient = {
    start(): void {
        ensureStarted()
    },
    getSnapshot(): LynttyStateSnapshot {
        return snapshot
    },
    subscribe(listener: () => void): () => void {
        ensureStarted()
        listeners.add(listener)
        return () => {
            listeners.delete(listener)
            if (listeners.size === 0 && unsubscribeIpc) {
                unsubscribeIpc()
                unsubscribeIpc = null
                initialized = false
            }
        }
    },
    async createAccount(): Promise<LynttyStateSnapshot> {
        ensureStarted()
        const next = await window.lyntty.createAccount()
        emit(next)
        return next
    },
    async startLinkDevice(): Promise<LynttyStateSnapshot> {
        ensureStarted()
        const next = await window.lyntty.startLinkDevice()
        emit(next)
        return next
    },
    async restoreSecret(secretKey: string): Promise<LynttyStateSnapshot> {
        ensureStarted()
        const next = await window.lyntty.restoreSecret(secretKey)
        emit(next)
        return next
    },
    async cancelAuth(): Promise<LynttyStateSnapshot> {
        ensureStarted()
        const next = await window.lyntty.cancelAuth()
        emit(next)
        return next
    },
    async logout(): Promise<LynttyStateSnapshot> {
        ensureStarted()
        const next = await window.lyntty.logout()
        emit(next)
        return next
    },
    async clientStatus(): Promise<LynttyAuthenticatedClientStatus> {
        ensureStarted()
        return window.lyntty.clientStatus()
    },
}

export function useLynttyState(): LynttyStateSnapshot {
    return useSyncExternalStore(
        lynttyClient.subscribe,
        lynttyClient.getSnapshot,
        lynttyClient.getSnapshot,
    )
}
