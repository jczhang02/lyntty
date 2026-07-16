/**
 * Bun preload setup for CLI unit tests.
 *
 * Keep every test process away from a developer's real ~/.pi and ~/.lyntty.
 * The compiled daemon integration target provisions its own isolated stack.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'bun:test'

const previousEnvironment = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    LYNTTY_HOME_DIR: process.env.LYNTTY_HOME_DIR,
}
const testRoot = mkdtempSync(join(tmpdir(), 'lyntty-cli-test-'))
const testHome = join(testRoot, 'home')

process.env.HOME = testHome
process.env.USERPROFILE = testHome
process.env.LYNTTY_HOME_DIR = join(testRoot, 'lyntty')

afterAll(() => {
    for (const [key, value] of Object.entries(previousEnvironment)) {
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }
    rmSync(testRoot, { recursive: true, force: true })
})
