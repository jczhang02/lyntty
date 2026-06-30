import { lynttyClient } from '@/lyntty/client'
import type {
    AuthState,
    Capability,
    Plugin,
    PluginContext,
} from '../types'
import type { LynttyStateSnapshot } from '@/shared/lyntty-protocol'

function mapAuth(state: LynttyStateSnapshot): AuthState {
    switch (state.status) {
        case 'authenticated':
            return { status: 'connected', account: state.accountId }
        case 'authenticating':
        case 'starting':
            return { status: 'connecting' }
        case 'error':
            return { status: 'error', message: state.error ?? 'Lyntty authentication failed' }
        case 'unconfigured':
            return { status: 'unconfigured' }
    }
}

class LynttyPlugin implements Plugin {
    id = 'lyntty'
    name = 'Lyntty'
    description = 'Encrypted Lyntty account connection for future sync and remote session support.'
    vendor = 'Lyntty'
    category = 'integrations' as const
    accent = '#2563eb'

    private auth: AuthState = { status: 'connecting' }
    private capabilities: Capability[] = []
    private unsubscribe: (() => void) | null = null

    async activate(ctx: PluginContext) {
        lynttyClient.start()
        this.auth = mapAuth(lynttyClient.getSnapshot())
        this.unsubscribe = lynttyClient.subscribe(() => {
            this.auth = mapAuth(lynttyClient.getSnapshot())
            ctx.onAuthChanged()
        })
    }

    async connect(_credential: string, ctx: PluginContext): Promise<AuthState> {
        this.auth = { status: 'connecting' }
        ctx.onAuthChanged()
        const next = await lynttyClient.startLinkDevice()
        this.auth = mapAuth(next)
        ctx.onAuthChanged()
        return this.auth
    }

    async disconnect(ctx: PluginContext) {
        await lynttyClient.logout()
        this.auth = mapAuth(lynttyClient.getSnapshot())
        ctx.onAuthChanged()
    }

    getAuthState(): AuthState { return this.auth }
    getCapabilities(): readonly Capability[] { return this.capabilities }

    dispose(): void {
        this.unsubscribe?.()
        this.unsubscribe = null
    }
}

export const lynttyPlugin: Plugin = new LynttyPlugin()
