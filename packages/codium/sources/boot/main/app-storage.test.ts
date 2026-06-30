import { describe, expect, it } from 'vitest'
import { lynttyHomeDir, lynttyHomeName } from './app-storage'

describe('Lyntty app storage paths', () => {
    it('uses capital Lyntty on macOS and Windows', () => {
        expect(lynttyHomeName('darwin')).toBe('Lyntty')
        expect(lynttyHomeName('win32')).toBe('Lyntty')
        expect(lynttyHomeDir('darwin', '/Users/alice')).toBe('/Users/alice/Lyntty')
        expect(lynttyHomeDir('win32', '/Users/alice')).toBe('/Users/alice/Lyntty')
    })

    it('uses lowercase lyntty on Linux', () => {
        expect(lynttyHomeName('linux')).toBe('lyntty')
        expect(lynttyHomeDir('linux', '/home/alice')).toBe('/home/alice/lyntty')
    })
})
