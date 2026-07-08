import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, it } from 'vitest';

// Local ESLint rule is authored as an ESM config module for direct ESLint loading.
import rule from '../../scripts/eslint-rules/no-hardcoded-user-strings.mjs';

const ruleTester = new RuleTester({
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
});

describe('no-hardcoded-user-strings', () => {
    it('accepts i18n calls and technical literals while rejecting UI copy', () => {
        ruleTester.run('no-hardcoded-user-strings', rule as any, {
            valid: [
                {
                    code: "const view = <Item title={t('settings.title')} subtitle={t('settings.subtitle')} />;",
                },
                {
                    code: "const view = <Ionicons name=\"cloud-outline\" size={29} />;",
                },
                {
                    code: "router.push('/settings/account');",
                },
                {
                    code: "const view = <Item placeholder=\"lyntty://terminal?...\" />;",
                },
                {
                    code: "Modal.alert(t('common.error'), t('errors.networkError'));",
                },
                {
                    code: "const value = 'dark';",
                },
                {
                    code: "const view = <Text>LYNTTY</Text>;",
                },
                {
                    code: "const theme = { text: '#FF9500' };",
                },
                {
                    code: "const view = <Text>$ npm i -g lyntty</Text>;",
                },
                {
                    code: "const view = <>{Platform.OS === 'web' && <Text>{t('common.ok')}</Text>}</>;",
                },
            ],
            invalid: [
                {
                    code: 'const view = <Item title="Push Notifications" />;',
                    errors: [{ messageId: 'hardcoded' }],
                },
                {
                    code: 'const view = <Text>Delete Push Token</Text>;',
                    errors: [{ messageId: 'hardcodedJsxText' }],
                },
                {
                    code: "Modal.alert('Error', 'Failed to load push notification settings.');",
                    errors: [{ messageId: 'hardcodedModal' }, { messageId: 'hardcodedModal' }],
                },
                {
                    code: "Alert.alert('Open Settings', 'Enable notifications in Settings.');",
                    errors: [{ messageId: 'hardcodedModal' }, { messageId: 'hardcodedModal' }],
                },
                {
                    code: "const view = <Item title={`Registered Tokens (${count})`} />;",
                    errors: [{ messageId: 'hardcoded' }],
                },
                {
                    code: "const view = <Item subtitle={enabled ? 'Enabled for this device' : 'Not requested'} />;",
                    errors: [{ messageId: 'hardcoded' }, { messageId: 'hardcoded' }],
                },
                {
                    code: "Modal.confirm(t('common.delete'), t('item.confirm'), { confirmText: 'Delete Push Token' });",
                    errors: [{ messageId: 'hardcodedModal' }],
                },
                {
                    code: "const menuItem = { title: 'Resume Pi Session', subtitle: 'Resume disconnected pi sessions through lynttyd' };",
                    errors: [{ messageId: 'hardcodedObject' }, { messageId: 'hardcodedObject' }],
                },
            ],
        });
    });
});
