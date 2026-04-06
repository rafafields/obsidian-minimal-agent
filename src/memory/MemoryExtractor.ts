import { OpenRouterClient } from '../llm/OpenRouterClient';
import { LLMError, type ChatMessage, type MemoryItemCandidate } from '../types';
import { countTokens } from '../utils/tokens';

const COMPRESSION_THRESHOLD = 6000;
const COMPRESSED_MAX = 5000;

const SYSTEM_PROMPT = `You are a structured memory extractor. Your sole function is to analyze a conversation session and determine what information deserves to be persisted as long-term memory.

You operate with a conservative bias: it is better to extract nothing than to extract noise.
Only extract what will still be relevant in 4 weeks.

Output format: JSON array. Write nothing outside the JSON.`;

function buildUserPrompt(taxonomy: string, transcript: string): string {
	return `## Agent configuration

### Authorized tag taxonomy
${taxonomy}

## Session transcript

${transcript}

## Instruction

Analyze the session and extract between 0 and 5 memory_item candidates.

For each candidate return a JSON object with exactly these fields:
{
  "title": "descriptive-kebab-case-slug",
  "memory_kind": "decision|insight|constraint|risk|summary|pattern",
  "memory_tier": "working|semantic",
  "importance": "low|medium|high|critical",
  "confidence": "low|medium|high",
  "tags": ["#topic/x"],
  "proposed_tags": [],
  "what": "2-4 readable sentences without session-specific context.",
  "implication": "Why this matters for the agent or the user.",
  "expires_at": "YYYY-MM-DD or null"
}

Criteria:
EXTRACT if → a decision was made with explicit reasoning
EXTRACT if → a real constraint was identified
EXTRACT if → a non-obvious insight about the domain or user emerged
EXTRACT if → a concrete risk was identified
EXTRACT if → the user revealed a preference or recurring pattern

DO NOT EXTRACT if → the information is ephemeral and only relevant to this session
DO NOT EXTRACT if → the context is already present in soul.md or user.md
DO NOT EXTRACT if → it is a pending task or action
DO NOT EXTRACT if → it is a summary of what happened (that belongs in the episode)

If nothing deserves to be persisted: []`;
}

function sanitizeForPrompt(text: string): string {
	// Prevent fake section headers from hijacking the prompt structure
	return text.replace(/^(#{1,6})\s/gm, (_, h: string) => h.replace(/#/g, '＃') + ' ');
}

function formatTranscriptForPrompt(transcript: ChatMessage[]): string {
	return transcript
		.map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${sanitizeForPrompt(m.content)}`)
		.join('\n\n');
}

function firstSentences(text: string, n: number): string {
	const re = /[.!?]/g;
	let match: RegExpExecArray | null;
	let count = 0;
	let endIdx = text.length;
	while ((match = re.exec(text)) !== null) {
		count++;
		if (count === n) { endIdx = match.index + 1; break; }
	}
	return text.slice(0, endIdx).trim();
}

function lastSentences(text: string, n: number): string {
	const parts = text.trim().split(/[.!?]\s+/);
	return parts.slice(-n).join('. ').trim();
}

function isValidCandidate(v: unknown): v is MemoryItemCandidate {
	if (typeof v !== 'object' || v === null) return false;
	const o = v as Record<string, unknown>;
	return typeof o['title'] === 'string' && typeof o['what'] === 'string';
}

export class MemoryExtractor {
	async extract(
		transcript: ChatMessage[],
		taxonomy: string,
		apiKey: string,
		modelSlug: string,
	): Promise<MemoryItemCandidate[]> {
		const compressed = this.compressTranscript(transcript);
		const transcriptText = formatTranscriptForPrompt(compressed);

		const client = new OpenRouterClient(apiKey, modelSlug);

		let response: string;
		try {
			response = await client.chat(
				[
					{ role: 'system', content: SYSTEM_PROMPT },
					{ role: 'user', content: buildUserPrompt(taxonomy, transcriptText) },
				],
				{ temperature: 0 },
			);
		} catch (e) {
			if (e instanceof LLMError) throw e;
			throw new LLMError(`Extraction failed: ${String(e)}`, 0, '');
		}

		try {
			const jsonStr = this.extractJsonArray(response);
			const raw = JSON.parse(jsonStr) as unknown;
			if (!Array.isArray(raw)) return [];
			return raw.filter(isValidCandidate);
		} catch {
			return [];
		}
	}

	private compressTranscript(transcript: ChatMessage[]): ChatMessage[] {
		const totalTokens = transcript.reduce((s, m) => s + countTokens(m.content), 0);
		if (totalTokens <= COMPRESSION_THRESHOLD) return transcript;

		const compressed = transcript.map(m => ({
			role: m.role,
			content: m.role === 'user'
				? firstSentences(m.content, 2)
				: lastSentences(m.content, 3),
		}));

		// If still too large, truncate to last N messages
		let total = compressed.reduce((s, m) => s + countTokens(m.content), 0);
		while (total > COMPRESSED_MAX && compressed.length > 2) {
			const removed = compressed.splice(0, 2); // remove oldest pair
			total -= removed.reduce((s, m) => s + countTokens(m.content), 0);
		}

		return compressed;
	}

	private extractJsonArray(response: string): string {
		// Handle ```json ... ``` code blocks
		const codeBlock = response.match(/```(?:json)?\s*([\s\S]*?)```/);
		if (codeBlock?.[1]) return codeBlock[1].trim();

		// Find bare JSON array
		const arrayMatch = response.match(/\[[\s\S]*\]/);
		if (arrayMatch?.[0]) return arrayMatch[0];

		return response.trim();
	}
}
