export interface CuratedModel {
	slug: string;
	displayName: string;
	provider: string;
	inputPricePerM: number;
	outputPricePerM: number;
	tier: 'cheap' | 'expensive';
	zdr: boolean;
	description: string;
}

export const CURATED_MODELS: CuratedModel[] = [
	{
		slug: 'openai/gpt-5.4-nano',
		displayName: 'GPT-5.4 Nano',
		provider: 'OpenAI',
		inputPricePerM: 0.20,
		outputPricePerM: 1.25,
		tier: 'cheap',
		zdr: true,
		description: 'Ideal para agentes de respuesta rápida, asistentes de uso frecuente; fluido y natural para usuarios no técnicos.',
	},
	{
		slug: 'qwen/qwen3.5-27b',
		displayName: 'Qwen 3.5 27B',
		provider: 'Qwen',
		inputPricePerM: 0.19,
		outputPricePerM: 1.56,
		tier: 'cheap',
		zdr: true,
		description: 'Ideal para usuarios multilingüe o contextos internacionales; buena coherencia en conversaciones largas.',
	},
	{
		slug: 'anthropic/claude-sonnet-4.6',
		displayName: 'Claude Sonnet 4.6',
		provider: 'Anthropic',
		inputPricePerM: 3.00,
		outputPricePerM: 15.00,
		tier: 'expensive',
		zdr: true,
		description: 'Ideal para agentes complejos con personalidad rica, razonamiento empático, situaciones delicadas o profesionales; la mejor experiencia conversacional del rango medio-alto.',
	},
];

export const CUSTOM_MODEL_OPTION = '__custom__';

export function findCuratedModel(slug: string): CuratedModel | undefined {
	return CURATED_MODELS.find(m => m.slug === slug);
}
