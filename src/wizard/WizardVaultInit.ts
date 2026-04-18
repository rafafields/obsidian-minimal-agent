import type { VaultManager } from '../vault/VaultManager';
import { wrapLink } from '../utils/links';
import type { SoulFormState } from '../ui/SoulForm';
import { SoulManager } from '../souls/SoulManager';

export interface WizardInitData {
	soulFormState: SoulFormState;
	soulBody: string;
	soulPhrases: string[];
	userBody: string;
	selectedTags: Set<string>;
	apiKey: string;
	modelSlug: string;
	language: string;
}

export async function initVault(data: WizardInitData, vaultManager: VaultManager): Promise<void> {
	const { soulFormState: s, soulBody, soulPhrases, userBody, selectedTags } = data;

	const now = new Date();
	const date = now.toISOString().slice(0, 10);
	const datetime = now.toISOString().slice(0, 16);

	await vaultManager.ensurePath('_agent/souls');
	await vaultManager.ensurePath('_agent/memory/episodes');
	await vaultManager.ensurePath('_agent/memory/items');
	await vaultManager.ensurePath('_system/traces');
	await vaultManager.ensurePath('_system/memory_tiers');
	await vaultManager.ensurePath('_system/memory_kinds');
	await vaultManager.ensurePath('_system/states');
	await vaultManager.ensurePath('_system/origins');
	await vaultManager.ensurePath('_system/kinds');

	await createReferenceNotes(vaultManager);
	await createBaseFiles(vaultManager);

	const soulId = SoulManager.nameToId(s.name || 'Agent');
	const soulFmLines = [
		'---',
		`name: "${s.name || 'Agent'}"`,
		`emoji: ${s.emoji}`,
		`kind: "${wrapLink('agent_soul')}"`,
		`state: "${wrapLink('active')}"`,
		`created_at: ${date}`,
		`updated_at: ${date}`,
		`origin: "${wrapLink('hybrid')}"`,
	];
	if (s.soulModelSlug) soulFmLines.push(`model_slug: ${s.soulModelSlug}`);
	if (soulPhrases.length > 0) {
		soulFmLines.push(`loading_phrases: [${soulPhrases.map(p => `"${p.replace(/"/g, '\\"')}"`).join(', ')}]`);
	}
	soulFmLines.push('---', '', soulBody);
	await vaultManager.writeFile(`_agent/souls/${soulId}.md`, soulFmLines.join('\n'));

	await vaultManager.writeFile('_agent/user.md', [
		'---',
		`kind: "${wrapLink('agent_user')}"`,
		`state: "${wrapLink('active')}"`,
		`created_at: ${date}`,
		`updated_at: ${date}`,
		`origin: "${wrapLink('hybrid')}"`,
		'---',
		'',
		userBody,
	].join('\n'));

	await vaultManager.writeFile('_agent/taxonomy.md', [
		'---',
		'kind: agent_taxonomy',
		`updated_at: ${date}`,
		'origin: human',
		'---',
		'',
		'## Active topics',
		'',
		[...selectedTags].join('\n'),
		'',
		'## Pending proposals',
	].join('\n'));

	await vaultManager.writeFile('_agent/memory/active.md', [
		'---',
		'kind: memory_active',
		'state: current',
		`created_at: ${date}`,
		`updated_at: ${datetime}`,
		'origin: hybrid',
		'---',
		'',
		'## Current focus',
		'',
		'## Recent decisions',
		'',
		'## Blockers',
		'',
		'none',
		'',
		'## Next step',
	].join('\n'));
}

async function createReferenceNotes(vaultManager: VaultManager): Promise<void> {
	const notes: [string, string][] = [
		['_system/memory_tiers/working.md', '# Working\n\nMemory held in `active.md` for the current session or short-term focus.'],
		['_system/memory_tiers/semantic.md', '# Semantic\n\nLong-term memory items indexed by score for context assembly.'],
		['_system/memory_kinds/decision.md', '# Decision\n\nA choice made with intent, with lasting implications.'],
		['_system/memory_kinds/insight.md', '# Insight\n\nA pattern or realization extracted from experience.'],
		['_system/memory_kinds/constraint.md', '# Constraint\n\nA hard limit or boundary that shapes what is possible.'],
		['_system/memory_kinds/risk.md', '# Risk\n\nAn open threat or uncertainty worth tracking.'],
		['_system/memory_kinds/summary.md', '# Summary\n\nA compressed account of events or context.'],
		['_system/memory_kinds/pattern.md', '# Pattern\n\nA recurring behavior, structure, or tendency worth naming.'],
		['_system/states/pending.md', '# Pending\n\nExtracted by the agent, awaiting review. Not yet used in context.'],
		['_system/states/active.md', '# Active\n\nConfirmed and eligible for context assembly.'],
		['_system/states/stale.md', '# Stale\n\nExpired. No longer included in context.'],
		['_system/states/archived.md', '# Archived\n\nManually retired. Kept for reference.'],
		['_system/states/confirmed.md', '# Confirmed\n\nEpisode or item accepted as part of the permanent record.'],
		['_system/origins/agent.md', '# Agent\n\nCreated by the agent from session content.'],
		['_system/origins/human.md', '# Human\n\nCreated directly by the user.'],
		['_system/origins/hybrid.md', '# Hybrid\n\nCreated collaboratively between user and agent.'],
		['_system/kinds/memory_item.md', '# Memory Item\n\nA discrete piece of long-term memory.'],
		['_system/kinds/memory_episode.md', '# Memory Episode\n\nA session summary with transcript and extracted candidates.'],
		['_system/kinds/agent_soul.md', '# Agent Soul\n\nPersonality and identity definition for an agent.'],
	];

	for (const [path, content] of notes) {
		if (!vaultManager.fileExists(path)) {
			await vaultManager.writeFile(path, content);
		}
	}
}

async function createBaseFiles(vaultManager: VaultManager): Promise<void> {
	const bases: [string, string][] = [
		['_agent/memory/episodes/_episodes.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_agent/memory/episodes")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - kind',
			'      - state',
			'      - origin',
			'      - session_id',
			'      - soul',
			'      - token_cost',
			'      - created_at',
			'      - updated_at',
		].join('\n')],
		['_agent/memory/items/_memory-items.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_agent/memory/items")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - kind',
			'      - state',
			'      - created_at',
			'      - updated_at',
			'      - origin',
			'      - memory_tier',
			'      - memory_kind',
			'      - importance',
			'      - confidence',
			'      - tags',
			'      - expires_at',
			'      - proposed_tags',
			'      - related_to',
			'      - session_id',
			'      - soul',
		].join('\n')],
		['_agent/souls/_souls.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_agent/souls")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - emoji',
			'      - name',
			'      - kind',
			'      - loading_phrases',
			'      - origin',
			'      - created_at',
			'      - updated_at',
		].join('\n')],
		['_system/traces/_traces.base', [
			'views:',
			'  - type: table',
			'    name: Tabla',
			'    filters:',
			'      and:',
			'        - file.inFolder("_system/traces")',
			'        - file.ext != "base"',
			'    order:',
			'      - file.name',
			'      - file.ctime',
		].join('\n')],
	];

	for (const [path, content] of bases) {
		if (!vaultManager.fileExists(path)) {
			await vaultManager.writeFile(path, content);
		}
	}
}
