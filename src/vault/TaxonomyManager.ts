import type { VaultManager } from './VaultManager';
import type { FrontmatterParser } from './FrontmatterParser';

const TAXONOMY_PATH = '_agent/taxonomy.md';
const ACTIVE_SECTION = 'Topics activos';

export class TaxonomyManager {
	constructor(
		private vaultManager: VaultManager,
		private parser: FrontmatterParser,
	) {}

	async getActiveTagsContent(): Promise<string> {
		const content = await this.vaultManager.readFile(TAXONOMY_PATH);
		if (!content) return '';

		const { body } = this.parser.parse(content);
		const lines = body.split('\n');
		let inSection = false;
		const sectionLines: string[] = [];

		for (const line of lines) {
			if (line.trimEnd() === `## ${ACTIVE_SECTION}`) {
				inSection = true;
				continue;
			}
			if (inSection && line.startsWith('## ')) break;
			if (inSection) sectionLines.push(line);
		}

		return sectionLines.join('\n').trim();
	}

	async addToActive(tags: string[]): Promise<void> {
		if (tags.length === 0) return;

		const content = await this.vaultManager.readFile(TAXONOMY_PATH);
		if (!content) return;

		const { frontmatter, body } = this.parser.parse(content);
		const activeContent = await this.getActiveTagsContent();

		const existingTags = new Set(
			activeContent.split('\n').map(l => l.trim()).filter(l => l.startsWith('#')),
		);

		const newTags = tags.filter(t => !existingTags.has(t));
		if (newTags.length === 0) return;

		const updatedSection = (activeContent.trimEnd() + '\n' + newTags.join('\n')).trim();
		const updatedBody = this.parser.updateSection(body, ACTIVE_SECTION, updatedSection);
		const updatedFm = { ...frontmatter, updated_at: new Date().toISOString().slice(0, 10) };

		await this.vaultManager.writeFile(
			TAXONOMY_PATH,
			this.parser.serialize(updatedFm, updatedBody),
		);
	}
}
