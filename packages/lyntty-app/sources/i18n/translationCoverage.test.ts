import { describe, expect, it } from 'vitest';

import { en, type TranslationStructure } from '@/text/_default';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/text/_all';
import { ru } from '@/text/translations/ru';
import { pl } from '@/text/translations/pl';
import { es } from '@/text/translations/es';
import { it as itTranslations } from '@/text/translations/it';
import { pt } from '@/text/translations/pt';
import { ca } from '@/text/translations/ca';
import { zhHans } from '@/text/translations/zh-Hans';
import { zhHant } from '@/text/translations/zh-Hant';
import { ja } from '@/text/translations/ja';

const translations: Record<SupportedLanguage, TranslationStructure> = {
    en,
    ru,
    pl,
    es,
    it: itTranslations,
    pt,
    ca,
    'zh-Hans': zhHans,
    'zh-Hant': zhHant,
    ja,
};

type LeafMap = Map<string, string>;

function flattenStrings(value: unknown, prefix = ''): LeafMap {
    const result: LeafMap = new Map();
    if (!value || typeof value !== 'object') {
        return result;
    }

    for (const [key, child] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof child === 'string') {
            result.set(path, child);
        } else if (typeof child === 'function') {
            result.set(path, '[function]');
        } else if (child && typeof child === 'object') {
            for (const [childPath, childValue] of flattenStrings(child, path)) {
                result.set(childPath, childValue);
            }
        }
    }
    return result;
}

function isTechnicalSameAllowed(path: string, englishValue: string): boolean {
    if (englishValue === '[function]') {
        return true;
    }
    if (path.startsWith('appWide.') && /^(API|CLI|HTTP|HTTPS|ID|JSON|OK|PID|QR|URL|UUID|Agent|Lyntty|GitHub|pi|relay|Session Remote|Worktree|Runtime|Diff)$/.test(englishValue)) {
        return true;
    }
    return false;
}

describe('translation coverage', () => {
    it('has a translation object for every supported language', () => {
        expect(Object.keys(translations).sort()).toEqual([...SUPPORTED_LANGUAGE_CODES].sort());
    });

    it('keeps every locale structurally aligned with English', () => {
        const englishKeys = [...flattenStrings(en).keys()].sort();
        for (const [language, translation] of Object.entries(translations)) {
            expect([...flattenStrings(translation).keys()].sort(), language).toEqual(englishKeys);
        }
    });

    it('keeps the app-wide i18n guard dictionary populated', () => {
        expect(Object.keys(en.appWide)).toHaveLength(150);
    });

    it('localizes app-wide Simplified and Traditional Chinese strings', () => {
        const english = flattenStrings(en);
        for (const language of ['zh-Hans', 'zh-Hant'] as const) {
            const localized = flattenStrings(translations[language]);
            const untranslated = [...english.entries()]
                .filter(([path]) => path.startsWith('appWide.'))
                .filter(([path, value]) => localized.get(path) === value && !isTechnicalSameAllowed(path, value))
                .map(([path]) => path);
            expect(untranslated, language).toEqual([]);
        }
    });
});
