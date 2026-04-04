import { LLMError, type ChatMessage } from '../types';

interface OpenRouterResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
	error?: {
		message: string;
	};
}

export class OpenRouterClient {
	private static readonly ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

	constructor(private apiKey: string, private modelSlug: string) {}

	async chat(messages: ChatMessage[], options?: { temperature?: number }): Promise<string> {
		let response: Response;

		try {
			response = await fetch(OpenRouterClient.ENDPOINT, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.apiKey}`,
					'Content-Type': 'application/json',
					'HTTP-Referer': 'obsidian://minimal-agent',
					'X-Title': 'Minimal Agent',
				},
				body: JSON.stringify({
					model: this.modelSlug,
					messages,
					temperature: options?.temperature ?? 0.7,
				}),
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new LLMError(`Network error: ${msg}`, 0, '');
		}

		const rawBody = await response.text();

		if (!response.ok) {
			let errorMessage = `API error ${response.status}`;
			try {
				const parsed = JSON.parse(rawBody) as { error?: { message?: string } };
				if (parsed.error?.message) {
					errorMessage = `${response.status}: ${parsed.error.message}`;
				}
			} catch {
				// keep generic message
			}
			throw new LLMError(errorMessage, response.status, rawBody);
		}

		let parsed: OpenRouterResponse;
		try {
			parsed = JSON.parse(rawBody) as OpenRouterResponse;
		} catch {
			throw new LLMError('Invalid JSON in API response', response.status, rawBody);
		}

		const content = parsed.choices?.[0]?.message?.content;
		if (content === undefined || content === null) {
			throw new LLMError('Empty response from API', response.status, rawBody);
		}

		return content;
	}
}
