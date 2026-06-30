import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function lynttyHomeName(platform: NodeJS.Platform = process.platform): 'Lyntty' | 'lyntty' {
    return platform === 'linux' ? 'lyntty' : 'Lyntty'
}

export function lynttyHomeDir(
    platform: NodeJS.Platform = process.platform,
    homeDir: string = homedir(),
): string {
    return join(homeDir, lynttyHomeName(platform))
}

export function ensureLynttyHomeDir(): string {
    const dir = lynttyHomeDir()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    return dir
}

export function stateDatabasePath(): string {
    return join(ensureLynttyHomeDir(), 'state.sqlite')
}

export function workspacesRootDir(): string {
    return join(ensureLynttyHomeDir(), 'workspaces')
}

export function projectWorkspacesDir(projectName: string): string {
    return join(workspacesRootDir(), projectName)
}

export function storageFilePath(filename: string): string {
    return join(ensureLynttyHomeDir(), filename)
}
