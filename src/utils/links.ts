export function wrapLink(value: string): string {
	return `[[${value}]]`;
}

export function unwrapLink(value: string): string {
	if (value.startsWith('[[') && value.endsWith(']]')) {
		return value.slice(2, -2);
	}
	return value;
}
