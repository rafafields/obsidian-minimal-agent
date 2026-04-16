import { Notice } from 'obsidian';
import type { VaultManager } from '../vault/VaultManager';
import type { FrontmatterParser } from '../vault/FrontmatterParser';
import type { TaxonomyManager } from '../vault/TaxonomyManager';
import { MemoryExtractor } from '../memory/MemoryExtractor';
import type { ChatMessage, MemoryItemCandidate } from '../types';
import { countTokens } from '../utils/tokens';
import { t } from '../utils/language';

export class SessionManager {
	private extractor = new MemoryExtractor();

	constructor(
		private vaultManager: VaultManager,
		private parser: FrontmatterParser,
		private taxonomyManager: TaxonomyManager,
		private getApiKey: () => string,
		private getModelSlug: () => string,
		private getLanguage: () => string,
	) {}

	async finalizeSession(transcript: ChatMessage[], soulId: string, soulName: string): Promise<void> {
		if (transcript.length === 0) return;

		const now = new Date();
		const isoDatetime = now.toISOString().slice(0, 16); // 2024-01-15T14:30
		const filenameDatetime = isoDatetime.replace('T', '-').replace(':', '-'); // 2024-01-15-14-30
		const datetime = isoDatetime;
		const episodePath = `_agent/memory/episodes/${filenameDatetime}.md`;
		const sessionId = filenameDatetime;

		// Extract memory candidates
		const taxonomy = await this.taxonomyManager.getActiveTagsContent();
		let candidates: MemoryItemCandidate[] = [];
		try {
			candidates = await this.extractor.extract(
				transcript,
				taxonomy,
				this.getApiKey(),
				this.getModelSlug(),
				this.getLanguage(),
			);
		} catch {
			new Notice(t('session_extraction_failed', this.getLanguage()));
		}

		// Write episode
		await this.writeEpisode(episodePath, sessionId, datetime, soulId, soulName, transcript, candidates);

		// Write memory candidates to _pending/
		for (const candidate of candidates) {
			await this.writePendingItem(candidate, sessionId, datetime, soulId);
		}

		// Write trace
		await this.writeTrace(sessionId, datetime, transcript, candidates);

		// Update active.md if any high/critical items
		const important = candidates.filter(c => c.importance === 'high' || c.importance === 'critical');
		if (important.length > 0) {
			await this.updateActiveMdFromCandidates(important, datetime);
		}

		const lang = this.getLanguage();
		const savedNotice = candidates.length === 0
			? t('session_saved_zero', lang)
			: candidates.length === 1
				? t('session_saved_one', lang)
				: t('session_saved_many', lang, { n: String(candidates.length) });
		new Notice(savedNotice);
	}

	// — Episode —

	private async writeEpisode(
		episodePath: string,
		sessionId: string,
		datetime: string,
		soulId: string,
		soulName: string,
		transcript: ChatMessage[],
		candidates: MemoryItemCandidate[],
	): Promise<void> {
		const tokenCost = transcript.reduce((s, m) => s + countTokens(m.content), 0);
		const firstUserMsg = transcript.find(m => m.role === 'user')?.content ?? '';
		const intention = firstUserMsg.slice(0, 120) + (firstUserMsg.length > 120 ? '…' : '');

		const decisions = candidates.filter(c => c.memory_kind === 'decision');
		const risks = candidates.filter(c => c.memory_kind === 'risk');

		const decisionLines = decisions.length > 0
			? decisions.map(c => `- ${c.title}: ${c.what.slice(0, 80)}`).join('\n')
			: 'none';

		const riskLines = risks.length > 0
			? risks.map(c => `- ${c.title}`).join('\n')
			: 'none';

		const sessionBlock = [
			`## Session ${datetime.replace('T', ' ')}`,
			'',
			'### What was attempted',
			'',
			intention,
			'',
			'### What was produced',
			'',
			`- ${Math.floor(transcript.length / 2)} exchanges`,
			`- ${candidates.length} memory candidates extracted`,
			'',
			'### Decisions made',
			'',
			decisionLines,
			'',
			'### Open questions',
			'',
			riskLines,
		].join('\n');

		const fm = {
			kind: 'memory_episode',
			state: 'confirmed',
			created_at: datetime,
			updated_at: datetime,
			origin: `[[${soulName}]]`,
			session_id: sessionId,
			soul: soulId,
			token_cost: tokenCost,
		};
		await this.vaultManager.writeFile(episodePath, this.parser.serialize(fm, sessionBlock));
	}

	// — Memory items —

	private async writePendingItem(
		candidate: MemoryItemCandidate,
		sessionId: string,
		datetime: string,
		soulId: string,
	): Promise<void> {
		const filename = this.sanitizeFilename(candidate.title);
		const path = `_agent/memory/items/_pending/${filename}.md`;

		const fm: Record<string, unknown> = {
			kind: 'memory_item',
			state: 'draft',
			created_at: datetime,
			updated_at: datetime,
			origin: 'agent',
			memory_tier: candidate.memory_tier,
			memory_kind: candidate.memory_kind,
			importance: candidate.importance,
			confidence: candidate.confidence,
			tags: candidate.tags,
			proposed_tags: candidate.proposed_tags,
			related_to: [],
			expires_at: candidate.expires_at,
			session_id: sessionId,
			soul: soulId,
		};

		const body = [
			'## What happened / what was learned',
			'',
			candidate.what,
			'',
			'## Implication',
			'',
			candidate.implication,
			'',
			'## Origin context',
			'',
			`Extracted from session ${sessionId}.`,
		].join('\n');

		await this.vaultManager.writeFile(path, this.parser.serialize(fm, body));
	}

	// — Trace —

	private async writeTrace(
		sessionId: string,
		datetime: string,
		transcript: ChatMessage[],
		candidates: MemoryItemCandidate[],
	): Promise<void> {
		const filename = datetime.replace('T', 'T').replace(':', '-') + `-${sessionId}-finalize.md`;
		const path = `_system/traces/${filename}`;

		const transcriptLines = transcript.map(m =>
			`### ${m.role === 'user' ? 'User' : 'Agent'}\n\n${m.content}`,
		).join('\n\n---\n\n');

		const content = [
			`# Trace: ${sessionId}`,
			'',
			`date: ${datetime}`,
			`turns: ${transcript.length}`,
			`candidates: ${candidates.length}`,
			'',
			'## Transcript',
			'',
			transcriptLines,
			'',
			'## Memory candidates',
			'',
			'```json',
			JSON.stringify(candidates, null, 2),
			'```',
		].join('\n');
		await this.vaultManager.writeFile(path, content);
	}

	// — active.md update (per-turn) —

	async updateActiveMdFromTurn(lastResponse: string): Promise<void> {
		const path = '_agent/memory/active.md';
		const content = await this.vaultManager.readFile(path);
		if (!content) return;

		const summary = this.extractSummary(lastResponse, 3);
		const now = new Date().toISOString().slice(0, 16);
		const { frontmatter, body } = this.parser.parse(content);
		const updatedBody = this.parser.updateSection(body, 'Current focus', summary);
		await this.vaultManager.writeFile(
			path,
			this.parser.serialize({ ...frontmatter, updated_at: now }, updatedBody),
		);
	}

	private extractSummary(text: string, maxSentences: number): string {
		const trimmed = text.trim();
		const sentenceEndRe = /[.!?]/g;
		let match: RegExpExecArray | null;
		let count = 0;
		let endIdx = trimmed.length;
		while ((match = sentenceEndRe.exec(trimmed)) !== null) {
			count++;
			if (count === maxSentences) {
				endIdx = match.index + 1;
				break;
			}
		}
		return trimmed.slice(0, endIdx);
	}

	// — active.md update (post-session) —

	private async updateActiveMdFromCandidates(
		candidates: MemoryItemCandidate[],
		datetime: string,
	): Promise<void> {
		const path = '_agent/memory/active.md';
		const content = await this.vaultManager.readFile(path);
		if (!content) return;

		const { frontmatter, body } = this.parser.parse(content);

		const decisionLines = candidates
			.map(c => `- [[memory/items/${this.sanitizeFilename(c.title)}]] — ${c.what.slice(0, 60)}`)
			.join('\n');

		const highestImportance = candidates.find(c => c.importance === 'critical') ?? candidates[0];
		const nextStep = highestImportance
			? `Review and confirm: _pending/${this.sanitizeFilename(highestImportance.title)}.md`
			: '';

		let updatedBody = this.parser.updateSection(body, 'Recent decisions', decisionLines);
		if (nextStep) {
			updatedBody = this.parser.updateSection(updatedBody, 'Next step', nextStep);
		}

		const updatedFm = { ...frontmatter, updated_at: datetime };
		await this.vaultManager.writeFile(path, this.parser.serialize(updatedFm, updatedBody));
	}

	// — Helpers —

	private sanitizeFilename(slug: string): string {
		return slug
			.toLowerCase()
			.replace(/[^a-z0-9-]/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}
}

