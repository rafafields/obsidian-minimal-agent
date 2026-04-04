import { OpenRouterClient } from '../llm/OpenRouterClient';
import { LLMError, type ChatMessage, type MemoryItemCandidate } from '../types';
import { countTokens } from '../utils/tokens';

const COMPRESSION_THRESHOLD = 6000;
const COMPRESSED_MAX = 5000;

const SYSTEM_PROMPT = `Eres un extractor de memoria estructurada. Tu única función es analizar una sesión de conversación y determinar qué información merece persistirse como memoria a largo plazo.

Operas con sesgo conservador: es mejor no extraer que extraer ruido.
Solo extrae lo que seguirá siendo relevante en 4 semanas.

Formato de salida: JSON array. No escribas nada fuera del JSON.`;

function buildUserPrompt(taxonomy: string, transcript: string): string {
	return `## Configuración del agente

### Taxonomía de tags autorizadas
${taxonomy}

## Transcript de la sesión

${transcript}

## Instrucción

Analiza la sesión y extrae entre 0 y 5 memory_item candidates.

Para cada candidato devuelve un objeto JSON con exactamente estos campos:
{
  "title": "slug-descriptivo-kebab-case",
  "memory_kind": "decision|insight|constraint|risk|summary|pattern",
  "memory_tier": "working|semantic",
  "importance": "low|medium|high|critical",
  "confidence": "low|medium|high",
  "tags": ["#topic/x"],
  "proposed_tags": [],
  "what": "2-4 frases legibles sin contexto de sesión.",
  "implication": "Por qué importa para el agente o el usuario.",
  "expires_at": "YYYY-MM-DD o null"
}

Criterios:
EXTRAE si → se tomó una decisión con razonamiento explícito
EXTRAE si → se identificó una restricción real
EXTRAE si → emergió un insight no obvio sobre el dominio o el usuario
EXTRAE si → hay un riesgo concreto identificado
EXTRAE si → el usuario reveló una preferencia o patrón recurrente

NO EXTRAE si → es información efímera que solo vale para esta sesión
NO EXTRAE si → es contexto ya presente en soul.md o user.md
NO EXTRAE si → es una tarea o acción pendiente
NO EXTRAE si → es resumen de lo que ocurrió (eso es el episode)

Si no hay nada que merezca persistirse: []`;
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
