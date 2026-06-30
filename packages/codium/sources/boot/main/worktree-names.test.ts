import { describe, expect, it } from 'vitest'
import {
    chooseVersionedName,
    chooseWorktreeName,
    slugifyPathPart,
    WORLD_CITY_NAMES,
} from './worktree-names'

describe('worktree names', () => {
    it('picks a random world city name', () => {
        expect(chooseWorktreeName([], () => 0)).toBe(WORLD_CITY_NAMES[0])
    })

    it('adds v suffixes when a city name clashes', () => {
        expect(chooseWorktreeName(['amsterdam'], () => 0)).toBe('amsterdam-v2')
        expect(chooseWorktreeName(['amsterdam', 'amsterdam-v2'], () => 0)).toBe('amsterdam-v3')
    })

    it('adds v suffixes when a project name clashes', () => {
        expect(chooseVersionedName('lyntty', [])).toBe('lyntty')
        expect(chooseVersionedName('lyntty', ['lyntty'])).toBe('lyntty-v2')
        expect(chooseVersionedName('lyntty', ['lyntty', 'lyntty-v2'])).toBe('lyntty-v3')
    })

    it('slugifies project path segments', () => {
        expect(slugifyPathPart('My Repo!')).toBe('my-repo')
        expect(slugifyPathPart('***', 'workspace')).toBe('workspace')
    })
})
