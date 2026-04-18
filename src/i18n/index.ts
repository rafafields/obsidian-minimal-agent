import EN from './en.json';
import ES from './es.json';

export type TranslationKey = keyof typeof EN;

export const LANGUAGES: Record<string, string> = {
	'English':   'English',
	'Español':   'Español',
	'Français':  'Français',
	'Deutsch':   'Deutsch',
	'Português': 'Português',
	'Italiano':  'Italiano',
	'中文':       '中文',
	'日本語':     '日本語',
	'한국어':     '한국어',
};

const LOCALE_MAP: Record<string, string> = {
	es: 'Español',
	fr: 'Français',
	de: 'Deutsch',
	pt: 'Português',
	it: 'Italiano',
	zh: '中文',
	ja: '日本語',
	ko: '한국어',
};

const TRANSLATIONS: Record<string, Partial<Record<TranslationKey, string>>> = {
	Español: ES as Partial<Record<TranslationKey, string>>,
};

export function detectDefaultLanguage(): string {
	const code = window.navigator.language?.split('-')[0] ?? 'en';
	return LOCALE_MAP[code] ?? 'English';
}

export function t(key: TranslationKey, lang: string, vars?: Record<string, string>): string {
	const dict = TRANSLATIONS[lang] ?? {};
	let str: string = (dict[key] ?? (EN as Record<TranslationKey, string>)[key]) as string;
	if (vars) {
		for (const [k, v] of Object.entries(vars)) {
			str = str.replace(`{${k}}`, v);
		}
	}
	return str;
}
