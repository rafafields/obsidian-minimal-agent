export interface ParsedFile {
	frontmatter: Record<string, unknown>;
	body: string;
}

export class FrontmatterParser {
	parse(rawContent: string): ParsedFile {
		const lines = rawContent.split('\n');
		if (lines[0]?.trimEnd() !== '---') {
			return { frontmatter: {}, body: rawContent };
		}

		let endIdx = -1;
		for (let i = 1; i < lines.length; i++) {
			if (lines[i]?.trimEnd() === '---') {
				endIdx = i;
				break;
			}
		}

		if (endIdx === -1) {
			return { frontmatter: {}, body: rawContent };
		}

		const yamlLines = lines.slice(1, endIdx);
		const bodyLines = lines.slice(endIdx + 1);
		// Strip leading blank line from body
		if (bodyLines[0] === '') bodyLines.shift();

		return {
			frontmatter: this.parseYamlLines(yamlLines),
			body: bodyLines.join('\n'),
		};
	}

	serialize(frontmatter: Record<string, unknown>, body: string): string {
		const lines: string[] = ['---'];

		for (const [key, value] of Object.entries(frontmatter)) {
			if (value === null || value === undefined) {
				lines.push(`${key}:`);
			} else if (Array.isArray(value)) {
				if (value.length === 0) {
					lines.push(`${key}: []`);
				} else {
					lines.push(`${key}:`);
					for (const item of value) {
						const str = String(item);
						// Quote values that start with # (YAML comment char) or contain special chars
						if (str.startsWith('#') || str.includes(':') || str.includes('"')) {
							lines.push(`  - "${str.replace(/"/g, '\\"')}"`);
						} else {
							lines.push(`  - ${str}`);
						}
					}
				}
			} else if (typeof value === 'boolean') {
				lines.push(`${key}: ${value}`);
			} else if (typeof value === 'number') {
				lines.push(`${key}: ${value}`);
			} else {
				const str = String(value);
				if (str.startsWith('#') || str.includes(':') || str.includes('"')) {
					lines.push(`${key}: "${str.replace(/"/g, '\\"')}"`);
				} else {
					lines.push(`${key}: ${str}`);
				}
			}
		}

		lines.push('---');
		if (body) {
			lines.push('');
			lines.push(body);
		}

		return lines.join('\n');
	}

	updateSection(rawContent: string, h2Header: string, newSectionBody: string): string {
		const lines = rawContent.split('\n');
		const headerLine = `## ${h2Header}`;

		let headerIdx = -1;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i]?.trimEnd() === headerLine) {
				headerIdx = i;
				break;
			}
		}

		if (headerIdx === -1) {
			// Section not found — append at end
			const trimmed = rawContent.trimEnd();
			return `${trimmed}\n\n${headerLine}\n\n${newSectionBody}`;
		}

		// Find where section ends (next ## header or end of array)
		let sectionEnd = lines.length;
		for (let i = headerIdx + 1; i < lines.length; i++) {
			if (lines[i]?.startsWith('## ')) {
				sectionEnd = i;
				break;
			}
		}

		const before = lines.slice(0, headerIdx + 1);
		const after = lines.slice(sectionEnd);

		const newLines = [
			...before,
			'',
			newSectionBody,
			...(after.length > 0 ? [''] : []),
			...after,
		];

		return newLines.join('\n');
	}

	private parseYamlLines(lines: string[]): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		let i = 0;

		while (i < lines.length) {
			const line = lines[i];
			if (!line || line.startsWith('#')) {
				i++;
				continue;
			}

			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) {
				i++;
				continue;
			}

			const key = line.slice(0, colonIdx).trim();
			const rawValue = line.slice(colonIdx + 1).trim();

			if (rawValue === '') {
				// Could be null or start of an array
				const arrayItems: string[] = [];
				while (i + 1 < lines.length && lines[i + 1]?.startsWith('  - ')) {
					i++;
					const rawItem = lines[i]!.slice(4);
					arrayItems.push(this.unquote(rawItem));
				}
				result[key] = arrayItems.length > 0 ? arrayItems : null;
			} else {
				result[key] = this.parseScalar(rawValue);
			}

			i++;
		}

		return result;
	}

	private parseScalar(value: string): unknown {
		if (value === 'null' || value === '~' || value === '') return null;
		if (value === 'true') return true;
		if (value === 'false') return false;
		const num = Number(value);
		if (!isNaN(num) && value.trim() !== '') return num;
		return this.unquote(value);
	}

	private unquote(value: string): string {
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			return value.slice(1, -1).replace(/\\"/g, '"');
		}
		return value;
	}
}
