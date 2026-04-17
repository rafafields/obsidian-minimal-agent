import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';
import type { Importance, MemoryItemFrontmatter, MemoryState } from '../types';
import { unwrapLink, wrapLink } from '../utils/links';

const IMPORTANCE_WEIGHT: Record<Importance, number> = {
	critical: 100,
	high: 75,
	medium: 40,
	low: 10,
};

const TIER_BONUS: Record<string, number> = {
	semantic: 20,
	working: 5,
};

const IMPORTANCE_ORDER: Importance[] = ['low', 'medium', 'high', 'critical'];

const INELIGIBLE_STATES: MemoryState[] = ['pending', 'stale', 'archived'];

function isMemoryItem(fm: unknown): fm is MemoryItemFrontmatter {
	return typeof fm === 'object' && fm !== null && (fm as Record<string, unknown>)['kind'] === 'memory_item';
}

export class MemoryManager {
	private scoreCache = new Map<string, number>();

	constructor(
		private vaultManager: VaultManager,
		private parser: FrontmatterParser,
	) {}

	scoreItem(frontmatter: MemoryItemFrontmatter): number {
		const importanceWeight = IMPORTANCE_WEIGHT[unwrapLink(frontmatter.importance) as Importance] ?? 10;
		const tierBonus = TIER_BONUS[unwrapLink(frontmatter.memory_tier)] ?? 0;

		const updatedAt = new Date(frontmatter.updated_at);
		const daysSince = Math.max(
			0,
			(Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24),
		);
		const stalenessPenalty = Math.min(30, daysSince * 0.5);

		return importanceWeight + tierBonus - stalenessPenalty;
	}

	isEligible(frontmatter: MemoryItemFrontmatter, minImportance: Importance): boolean {
		if (INELIGIBLE_STATES.includes(unwrapLink(frontmatter.state) as MemoryState)) return false;

		if (frontmatter.expires_at) {
			if (new Date(frontmatter.expires_at) < new Date()) return false;
		}

		return (
			IMPORTANCE_ORDER.indexOf(unwrapLink(frontmatter.importance) as Importance) >=
			IMPORTANCE_ORDER.indexOf(minImportance)
		);
	}

	async autoMarkStale(): Promise<void> {
		const files = this.vaultManager.listFiles('_agent/memory/items').filter(p => !p.endsWith('.base'));
		const now = new Date();

		for (const filePath of files) {
			const content = await this.vaultManager.readFile(filePath);
			if (!content) continue;

			const { frontmatter, body } = this.parser.parse(content);
			if (!isMemoryItem(frontmatter)) continue;
			const state = unwrapLink(frontmatter.state);
			if (state === 'stale' || state === 'archived' || state === 'pending') continue;
			if (!frontmatter.expires_at) continue;

			if (new Date(frontmatter.expires_at) < now) {
				const updated = {
					...frontmatter,
					state: wrapLink('stale') as unknown as MemoryState,
					updated_at: now.toISOString().slice(0, 16),
				};
				await this.vaultManager.writeFile(filePath, this.parser.serialize(updated, body));
				this.scoreCache.delete(filePath);
			}
		}
	}

	confirmItem(filePath: string, frontmatter: MemoryItemFrontmatter): void {
		this.scoreCache.set(filePath, this.scoreItem(frontmatter));
	}

	reindex(filePath: string): void {
		this.scoreCache.delete(filePath);
	}
}
