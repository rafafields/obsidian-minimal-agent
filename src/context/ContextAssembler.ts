import { Notice } from 'obsidian';
import type { AssemblyResult, ContextAssemblerOptions, ContextBlock, MemoryItemFrontmatter } from '../types';
import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';
import type { MemoryManager } from '../memory/MemoryManager';
import { countTokens } from '../utils/tokens';

const EPISODIC_BUDGET = 400;

function isMemoryItem(fm: unknown): fm is MemoryItemFrontmatter {
	return typeof fm === 'object' && fm !== null && (fm as Record<string, unknown>)['kind'] === 'memory_item';
}

export class ContextAssembler {
	constructor(
		private vaultManager: VaultManager,
		private parser: FrontmatterParser,
		private memoryManager: MemoryManager,
	) {}

	async assemble(options: ContextAssemblerOptions): Promise<AssemblyResult> {
		const blocks: ContextBlock[] = [];
		let totalTokens = 0;
		let droppedItems = 0;

		// — Layer 1: Bootstrap (always included) —
		const bootstrapPaths = [
			'_agent/soul.md',
			'_agent/user.md',
			'_agent/taxonomy.md',
			'_agent/memory/active.md',
		];

		const missingBootstrap: string[] = [];

		for (const filePath of bootstrapPaths) {
			const content = await this.vaultManager.readFile(filePath);
			if (!content) {
				missingBootstrap.push(filePath);
				continue;
			}
			const tokens = countTokens(content);
			blocks.push({ filePath, content, tokens, layer: 'bootstrap' });
			totalTokens += tokens;
		}

		if (missingBootstrap.length > 0) {
			new Notice(
				`Minimal Agent: missing bootstrap files — ${missingBootstrap.join(', ')}. ` +
				`Re-run the setup wizard or create them manually.`,
			);
		}

		const bootstrapTokens = totalTokens;
		if (bootstrapTokens > options.tokenBudget) {
			new Notice(
				`Minimal Agent: bootstrap files use ~${bootstrapTokens} tokens, ` +
				`which exceeds your budget of ${options.tokenBudget}. ` +
				`Increase the token budget in Settings → Minimal Agent.`,
			);
		}

		// — Layer 2: Episodic (up to EPISODIC_BUDGET tokens) —
		let episodicTokens = 0;
		const allEpisodes = this.vaultManager.listFiles('_agent/memory/episodes').sort().reverse();

		for (let i = 0; i < options.episodeDaysBack; i++) {
			if (episodicTokens >= EPISODIC_BUDGET) break;

			const d = new Date();
			d.setDate(d.getDate() - i);
			const dateStr = d.toISOString().slice(0, 10);

			const dateEpisodes = allEpisodes.filter(p => {
				const filename = p.split('/').pop() ?? '';
				return filename.startsWith(dateStr);
			});

			for (const filePath of dateEpisodes) {
				if (episodicTokens >= EPISODIC_BUDGET) break;
				const content = await this.vaultManager.readFile(filePath);
				if (!content) continue;
				const tokens = countTokens(content);
				if (episodicTokens + tokens > EPISODIC_BUDGET) continue;
				blocks.push({ filePath, content, tokens, layer: 'episodic' });
				totalTokens += tokens;
				episodicTokens += tokens;
			}
		}

		// — Layer 3: Semantic (remaining budget) —
		const remainingBudget = options.tokenBudget - totalTokens;

		if (remainingBudget > 0) {
			type Candidate = { filePath: string; content: string; tokens: number; score: number };
			const candidates: Candidate[] = [];

			for (const filePath of this.vaultManager.listFiles('_agent/memory/items')) {
				const content = await this.vaultManager.readFile(filePath);
				if (!content) continue;

				const { frontmatter } = this.parser.parse(content);
				if (!isMemoryItem(frontmatter)) continue;
				if (!this.memoryManager.isEligible(frontmatter, options.minImportance)) continue;

				candidates.push({
					filePath,
					content,
					tokens: countTokens(content),
					score: this.memoryManager.scoreItem(frontmatter),
				});
			}

			candidates.sort((a, b) => b.score - a.score);

			let semanticTokens = 0;
			for (const item of candidates) {
				if (semanticTokens + item.tokens > remainingBudget) {
					droppedItems++;
					continue;
				}
				blocks.push({ filePath: item.filePath, content: item.content, tokens: item.tokens, layer: 'semantic' });
				totalTokens += item.tokens;
				semanticTokens += item.tokens;
			}
		}

		return { blocks, totalTokens, droppedItems };
	}
}
