import { describe, expect, it } from 'vitest';
import { parseSessionFileLink, resolveSessionFilePath, splitSessionFileText } from './sessionFileLinks';

describe('sessionFileLinks', () => {
    const sessionRoot = '/Users/kirilldubovitskiy/projects/lyntty';

    it('parses absolute file refs with line numbers', () => {
        const result = parseSessionFileLink('/Users/kirilldubovitskiy/projects/lyntty/packages/lyntty-cli/src/codex/runCodex.ts:594', {
            sessionRoot,
        });

        expect(result).toEqual({
            path: '/Users/kirilldubovitskiy/projects/lyntty/packages/lyntty-cli/src/codex/runCodex.ts',
            absolutePath: '/Users/kirilldubovitskiy/projects/lyntty/packages/lyntty-cli/src/codex/runCodex.ts',
            relativePath: 'packages/lyntty-cli/src/codex/runCodex.ts',
            withinSessionRoot: true,
            line: 594,
            column: null,
        });
    });

    it('parses relative file refs with line and column numbers', () => {
        const result = parseSessionFileLink('packages/lyntty-cli/src/codex/runCodex.ts:594:2', {
            sessionRoot,
        });

        expect(result).toEqual({
            path: 'packages/lyntty-cli/src/codex/runCodex.ts',
            absolutePath: '/Users/kirilldubovitskiy/projects/lyntty/packages/lyntty-cli/src/codex/runCodex.ts',
            relativePath: 'packages/lyntty-cli/src/codex/runCodex.ts',
            withinSessionRoot: true,
            line: 594,
            column: 2,
        });
    });

    it('rejects external urls', () => {
        expect(parseSessionFileLink('https://openai.com', { sessionRoot })).toBeNull();
        expect(parseSessionFileLink('mailto:test@example.com', { sessionRoot })).toBeNull();
    });

    it('splits bare text into plain and linked segments', () => {
        const result = splitSessionFileText('Open packages/lyntty-cli/src/codex/runCodex.ts:594 please.', sessionRoot);

        expect(result).toEqual([
            { text: 'Open ', link: null },
            {
                text: 'packages/lyntty-cli/src/codex/runCodex.ts:594',
                link: {
                    path: 'packages/lyntty-cli/src/codex/runCodex.ts',
                    absolutePath: '/Users/kirilldubovitskiy/projects/lyntty/packages/lyntty-cli/src/codex/runCodex.ts',
                    relativePath: 'packages/lyntty-cli/src/codex/runCodex.ts',
                    withinSessionRoot: true,
                    line: 594,
                    column: null,
                },
            },
            { text: ' please.', link: null },
        ]);
    });

    it('splits absolute bare file refs with spaces into linked segments', () => {
        const result = splitSessionFileText(
            'Image: /Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
            sessionRoot,
        );

        expect(result).toEqual([
            { text: 'Image: ', link: null },
            {
                text: '/Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
                link: {
                    path: '/Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
                    absolutePath: '/Users/kirilldubovitskiy/Library/Application Support/CleanShot/media/test/CleanShot 2026-03-19 at 00.54.37@2x.png',
                    relativePath: null,
                    withinSessionRoot: false,
                    line: null,
                    column: null,
                },
            },
        ]);
    });

    it('does not turn version numbers into file refs', () => {
        expect(splitSessionFileText('Version 1.2.3 shipped.', sessionRoot)).toEqual([
            { text: 'Version 1.2.3 shipped.', link: null },
        ]);
    });

    it('does not turn slash-separated prose into file refs', () => {
        expect(splitSessionFileText(
            'Codex then starts/resumes turns with backend default model. I’m checking CLI docs/tests to confirm there is intentionally no lyntty codex model set or --model surface today.',
            sessionRoot,
        )).toEqual([
            {
                text: 'Codex then starts/resumes turns with backend default model. I’m checking CLI docs/tests to confirm there is intentionally no lyntty codex model set or --model surface today.',
                link: null,
            },
        ]);
    });

    it('resolves viewer input to an absolute path', () => {
        expect(resolveSessionFilePath('packages/lyntty-app/README.md', sessionRoot)).toEqual({
            path: 'packages/lyntty-app/README.md',
            absolutePath: '/Users/kirilldubovitskiy/projects/lyntty/packages/lyntty-app/README.md',
            relativePath: 'packages/lyntty-app/README.md',
            withinSessionRoot: true,
            line: null,
            column: null,
        });
    });
});
