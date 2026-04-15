import type { SoulMeta } from '../types';
import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';

export class SoulManager {
	constructor(
		private vaultManager: VaultManager,
		private parser: FrontmatterParser,
	) {}

	soulPath(id: string): string {
		return `_agent/souls/${id}.md`;
	}

	soulExists(id: string): boolean {
		return this.vaultManager.fileExists(this.soulPath(id));
	}

	async listSouls(): Promise<SoulMeta[]> {
		const files = this.vaultManager.listFiles('_agent/souls');
		const souls: SoulMeta[] = [];

		for (const filePath of files) {
			if (!filePath.endsWith('.md')) continue;
			const id = filePath.split('/').pop()!.replace(/\.md$/, '');
			const content = await this.vaultManager.readFile(filePath);
			if (!content) continue;

			const { frontmatter } = this.parser.parse(content);
			const name = typeof frontmatter['name'] === 'string' ? frontmatter['name'] : id;
			const emoji = typeof frontmatter['emoji'] === 'string' ? frontmatter['emoji'] : '✨';
			const model_slug = typeof frontmatter['model_slug'] === 'string' && frontmatter['model_slug']
				? frontmatter['model_slug']
				: undefined;
			const rawPhrases = frontmatter['loading_phrases'];
			const loading_phrases = Array.isArray(rawPhrases)
				? (rawPhrases as unknown[]).filter((p): p is string => typeof p === 'string')
				: undefined;
			souls.push({ id, name, emoji, path: filePath, model_slug, loading_phrases });
		}

		// Always show 'default' first if it exists
		souls.sort((a, b) =>
			a.id === 'default' ? -1 : b.id === 'default' ? 1 : a.name.localeCompare(b.name),
		);

		return souls;
	}

	async getSoulContent(id: string): Promise<string | null> {
		return this.vaultManager.readFile(this.soulPath(id));
	}

	/** Sanitize a display name into a filesystem-safe soul ID. */
	static nameToId(name: string): string {
		return (
			name
				.toLowerCase()
				.trim()
				.normalize('NFD')
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '')
				.replace(/-+/g, '-')
				.replace(/^-|-$/g, '') || 'soul'
		);
	}
}
