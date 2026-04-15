export interface SoulMeta {
	id: string;
	name: string;
	emoji: string;
	path: string;
	model_slug?: string;
	loading_phrases?: string[];
}

export type MemoryState = 'draft' | 'active' | 'stale' | 'archived';
export type MemoryTier = 'working' | 'semantic';
export type MemoryKind = 'decision' | 'insight' | 'constraint' | 'risk' | 'summary' | 'pattern';
export type Importance = 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';
export type Origin = 'agent' | 'human' | 'hybrid';
export type ContextLayer = 'bootstrap' | 'episodic' | 'semantic';

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant';
	content: string;
}

export interface LLMUsage {
	promptTokens: number;
	completionTokens: number;
}

export interface LLMResponse {
	content: string;
	usage: LLMUsage;
}

export interface ModelPricing {
	promptPerToken: number;
	completionPerToken: number;
}

export interface ContextBlock {
	filePath: string;
	content: string;
	tokens: number;
	layer: ContextLayer;
}

export interface AssemblyResult {
	blocks: ContextBlock[];
	totalTokens: number;
	droppedItems: number;
}

export interface ContextAssemblerOptions {
	tokenBudget: number;
	episodeDaysBack: number;
	minImportance: Importance;
	soulId: string;
}

export interface MemoryItemFrontmatter {
	kind: 'memory_item';
	state: MemoryState;
	created_at: string;
	updated_at: string;
	origin: Origin;
	memory_tier: MemoryTier;
	memory_kind: MemoryKind;
	importance: Importance;
	confidence: Confidence;
	tags: string[];
	related_to: string[];
	expires_at: string | null;
	session_id: string;
	soul: string;
	proposed_tags?: string[];
}

export interface EpisodeFrontmatter {
	kind: 'memory_episode';
	state: 'confirmed';
	created_at: string;
	updated_at: string;
	origin: string;
	session_id: string;
	soul: string;
	token_cost: number;
}

export interface MemoryItemCandidate {
	title: string;
	memory_kind: MemoryKind;
	memory_tier: MemoryTier;
	importance: Importance;
	confidence: Confidence;
	tags: string[];
	proposed_tags: string[];
	what: string;
	implication: string;
	expires_at: string | null;
}

export class LLMError extends Error {
	readonly status: number;
	readonly body: string;

	constructor(message: string, status: number, body: string) {
		super(message);
		this.name = 'LLMError';
		this.status = status;
		this.body = body;
	}
}
