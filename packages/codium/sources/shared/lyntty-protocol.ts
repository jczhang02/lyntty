export type LynttyAuthStatus =
    | 'starting'
    | 'unconfigured'
    | 'authenticating'
    | 'authenticated'
    | 'error'

export type LynttyAuthMethod = 'link-device' | 'create-account' | 'restore-secret'

export interface LynttyAuthFlowSnapshot {
    method: LynttyAuthMethod
    authUrl?: string
    publicKey?: string
    startedAt: number
}

export interface LynttyStateSnapshot {
    status: LynttyAuthStatus
    serverUrl: string
    webappUrl: string
    clientReady: boolean
    accountId?: string
    tokenExpiresAt?: number
    authFlow?: LynttyAuthFlowSnapshot
    error?: string
    updatedAt: number
}

export interface LynttyAuthenticatedClientStatus {
    ready: boolean
    serverUrl: string
    accountId?: string
    anonId?: string
    contentPublicKey?: string
}

export type LynttyWorkerRequest =
    | { kind: 'getState' }
    | { kind: 'createAccount' }
    | { kind: 'startLinkDevice' }
    | { kind: 'restoreSecret'; secretKey: string }
    | { kind: 'cancelAuth' }
    | { kind: 'logout' }
    | { kind: 'clientStatus' }

export type LynttyWorkerRequestWithId = LynttyWorkerRequest & { requestId: string }

export type LynttyWorkerResponse =
    | {
          kind: 'response'
          requestId: string
          ok: true
          state: LynttyStateSnapshot
          value?: unknown
      }
    | {
          kind: 'response'
          requestId: string
          ok: false
          state: LynttyStateSnapshot
          error: string
      }

export type LynttyWorkerStateMessage = {
    kind: 'state'
    state: LynttyStateSnapshot
}

export type LynttyWorkerFatalMessage = {
    kind: 'fatal'
    error: string
}

export type LynttyWorkerMessage =
    | LynttyWorkerResponse
    | LynttyWorkerStateMessage
    | LynttyWorkerFatalMessage
