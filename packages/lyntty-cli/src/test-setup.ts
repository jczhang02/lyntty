/**
 * Bun preload setup for CLI unit tests.
 *
 * Keep every test process away from a developer's real ~/.pi and ~/.lyntty.
 * Temporary state lives under the ignored package dist directory and is removed.
 */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll } from 'bun:test'

function prepareBundledTestTools(): void {
    const toolTarget = `${process.arch}-${process.platform}`
    const supportedTargets = new Set([
        'arm64-darwin',
        'arm64-linux',
        'arm64-win32',
        'x64-darwin',
        'x64-linux',
        'x64-win32',
    ])
    if (!supportedTargets.has(toolTarget)) return

    const toolsDir = resolve(import.meta.dir, '..', 'tools')
    const unpackedDir = join(toolsDir, 'unpacked')
    mkdirSync(unpackedDir, { recursive: true })
    const executableSuffix = process.platform === 'win32' ? '.exe' : ''
    for (const tool of ['difftastic', 'ripgrep'] as const) {
        const executable = join(unpackedDir, `${tool === 'difftastic' ? 'difft' : 'rg'}${executableSuffix}`)
        if (existsSync(executable)) continue
        const archive = join(toolsDir, 'archives', `${tool}-${toolTarget}.tar.gz`)
        const extracted = Bun.spawnSync(['tar', '-xzf', archive, '-C', unpackedDir])
        if (extracted.exitCode !== 0) {
            throw new Error(`Unable to extract ${tool} test tool: ${extracted.stderr.toString()}`)
        }
        if (!existsSync(executable)) throw new Error(`Missing extracted ${tool} test executable`)
        if (process.platform !== 'win32') chmodSync(executable, 0o755)
    }
}

prepareBundledTestTools()

const managedKeys = [
    'HOME',
    'USERPROFILE',
    'LYNTTY_HOME_DIR',
    'LYNTTY_INSTALL_ROOT',
    'LYNTTY_CLI_SOURCE_ENTRY',
    'LYNTTY_PI_EXTENSION_PATH',
    'PI_CODING_AGENT_DIR',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'XDG_STATE_HOME',
    'TMPDIR',
    'TEMP',
    'TMP',
] as const
const previousEnvironment = Object.fromEntries(managedKeys.map(key => [key, process.env[key]]))
const testBase = resolve(import.meta.dir, '..', 'dist', 'test-state')
mkdirSync(testBase, { recursive: true })
const testRoot = mkdtempSync(join(testBase, 'unit-'))
const testHome = join(testRoot, 'home')
const tempDir = join(testRoot, 'tmp')
mkdirSync(testHome, { recursive: true })
mkdirSync(tempDir, { recursive: true })

process.env.HOME = testHome
process.env.USERPROFILE = testHome
process.env.LYNTTY_HOME_DIR = join(testRoot, 'lyntty')
process.env.LYNTTY_INSTALL_ROOT = join(testRoot, 'install')
process.env.PI_CODING_AGENT_DIR = join(testRoot, 'pi-agent')
process.env.XDG_CONFIG_HOME = join(testRoot, 'xdg', 'config')
process.env.XDG_DATA_HOME = join(testRoot, 'xdg', 'data')
process.env.XDG_STATE_HOME = join(testRoot, 'xdg', 'state')
process.env.TMPDIR = tempDir
process.env.TEMP = tempDir
process.env.TMP = tempDir
delete process.env.LYNTTY_CLI_SOURCE_ENTRY
delete process.env.LYNTTY_PI_EXTENSION_PATH

afterAll(() => {
    for (const key of managedKeys) {
        const value = previousEnvironment[key]
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
    }
    rmSync(testRoot, { recursive: true, force: true })
})
