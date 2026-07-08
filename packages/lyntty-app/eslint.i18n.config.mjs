import tsParser from '@typescript-eslint/parser';
import noHardcodedUserStrings from './scripts/eslint-rules/no-hardcoded-user-strings.mjs';

const i18nPlugin = {
    rules: {
        'no-hardcoded-user-strings': noHardcodedUserStrings,
    },
};

const noopRule = {
    meta: {
        schema: [],
    },
    create() {
        return {};
    },
};

const reactHooksCompatPlugin = {
    rules: {
        'exhaustive-deps': noopRule,
    },
};

export default [
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'off',
        },
    },
    {
        ignores: [
            'sources/assets/**',
            'sources/text/**',
            'sources/**/*.test.ts',
            'sources/**/*.spec.ts',
            'sources/**/*.test.tsx',
            'sources/**/*.spec.tsx',
        ],
    },
    {
        files: ['sources/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
                ecmaVersion: 'latest',
                sourceType: 'module',
            },
        },
        plugins: {
            'lyntty-i18n': i18nPlugin,
            'react-hooks': reactHooksCompatPlugin,
        },
        rules: {
            'lyntty-i18n/no-hardcoded-user-strings': 'error',
        },
    },
];
