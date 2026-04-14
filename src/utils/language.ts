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

export function detectDefaultLanguage(): string {
	const code = window.navigator.language?.split('-')[0] ?? 'en';
	return LOCALE_MAP[code] ?? 'English';
}
