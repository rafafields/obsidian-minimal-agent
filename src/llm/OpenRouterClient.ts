import { LLMError, type ChatMessage, type LLMResponse, type ModelPricing } from '../types';

interface OpenRouterChatResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
	};
	error?: {
		message: string;
	};
}

interface OpenRouterModelsResponse {
	data: Array<{
		id: string;
		pricing?: {
			prompt?: string;
			completion?: string;
		};
	}>;
}

export class OpenRouterClient {
	private static readonly BASE = 'https://openrouter.ai/api/v1';

	constructor(private apiKey: string, private modelSlug: string) {}

	async chat(messages: ChatMessage[], options?: { temperature?: number }): Promise<LLMResponse> {
		const MAX_RETRIES = 3;
		const BASE_DELAY_MS = 2000;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			let response: Response;

			try {
				response = await fetch(`${OpenRouterClient.BASE}/chat/completions`, {
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

			if (response.status === 429 && attempt < MAX_RETRIES) {
				const retryAfter = response.headers.get('Retry-After');
				const delayMs = retryAfter
					? parseFloat(retryAfter) * 1000
					: BASE_DELAY_MS * Math.pow(2, attempt);
				await new Promise(resolve => window.setTimeout(resolve, delayMs));
				continue;
			}

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

			let parsed: OpenRouterChatResponse;
			try {
				parsed = JSON.parse(rawBody) as OpenRouterChatResponse;
			} catch {
				throw new LLMError('Invalid JSON in API response', response.status, rawBody);
			}

			const content = parsed.choices?.[0]?.message?.content;
			if (content === undefined || content === null) {
				throw new LLMError('Empty response from API', response.status, rawBody);
			}

			return {
				content,
				usage: {
					promptTokens: parsed.usage?.prompt_tokens ?? 0,
					completionTokens: parsed.usage?.completion_tokens ?? 0,
				},
			};
		}

		throw new LLMError('Rate limit exceeded after retries', 429, '');
	}

	static async fetchPricing(modelSlug: string, apiKey: string): Promise<ModelPricing> {
		const controller = new AbortController();
		const timer = window.setTimeout(() => controller.abort(), 5000);

		let response: Response;
		try {
			response = await fetch(`${OpenRouterClient.BASE}/models`, {
				signal: controller.signal,
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'HTTP-Referer': 'obsidian://minimal-agent',
					'X-Title': 'Minimal Agent',
				},
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			throw new LLMError(`Network error fetching pricing: ${msg}`, 0, '');
		} finally {
			window.clearTimeout(timer);
		}

		if (!response.ok) {
			throw new LLMError(`Pricing API error ${response.status}`, response.status, '');
		}

		let data: OpenRouterModelsResponse;
		try {
			data = JSON.parse(await response.text()) as OpenRouterModelsResponse;
		} catch {
			throw new LLMError('Invalid JSON in pricing response', response.status, '');
		}

		const model = data.data?.find(m => m.id === modelSlug);
		if (!model) {
			throw new LLMError(`Model "${modelSlug}" not found in OpenRouter models list`, 0, '');
		}

		const promptPerToken = parseFloat(model.pricing?.prompt ?? '');
		const completionPerToken = parseFloat(model.pricing?.completion ?? '');

		if (isNaN(promptPerToken) || isNaN(completionPerToken)) {
			throw new LLMError('No pricing data available for this model', 0, '');
		}

		return { promptPerToken, completionPerToken };
	}
}
