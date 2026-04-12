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
		slug: 'google/gemma-4-31b-it',
		displayName: 'Gemma 4 31B',
		provider: 'Google',
		inputPricePerM: 0.14,
		outputPricePerM: 0.40,
		tier: 'cheap',
		zdr: false,
		description: 'Ideal para chats cotidianos, asistentes de productividad, compañeros virtuales sencillos; buena personalidad con instrucciones claras.',
	},
	{
		slug: 'deepseek/deepseek-v3.2',
		displayName: 'DeepSeek V3.2',
		provider: 'DeepSeek',
		inputPricePerM: 0.26,
		outputPricePerM: 0.38,
		tier: 'cheap',
		zdr: false,
		description: 'Ideal para agentes técnicos o de ayuda con tareas concretas (código, datos, análisis); menos expresivo emocionalmente pero muy preciso.',
	},
	{
		slug: 'minimax/minimax-m2.7',
		displayName: 'MiniMax M2.7',
		provider: 'MiniMax',
		inputPricePerM: 0.30,
		outputPricePerM: 1.20,
		tier: 'cheap',
		zdr: false,
		description: 'Ideal para agentes que gestionan conversaciones largas o con mucho contexto acumulado; aguanta bien memorias extensas.',
	},
	{
		slug: 'openai/gpt-5.4-nano',
		displayName: 'GPT-5.4 Nano',
		provider: 'OpenAI',
		inputPricePerM: 0.20,
		outputPricePerM: 1.25,
		tier: 'cheap',
		zdr: false,
		description: 'Ideal para agentes de respuesta rápida, asistentes de uso frecuente; fluido y natural para usuarios no técnicos.',
	},
	{
		slug: 'qwen/qwen3.5-27b',
		displayName: 'Qwen 3.5 27B',
		provider: 'Qwen',
		inputPricePerM: 0.19,
		outputPricePerM: 1.56,
		tier: 'cheap',
		zdr: false,
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
	{
		slug: 'anthropic/claude-opus-4.6',
		displayName: 'Claude Opus 4.6',
		provider: 'Anthropic',
		inputPricePerM: 5.00,
		outputPricePerM: 25.00,
		tier: 'expensive',
		zdr: true,
		description: 'El agente más sofisticado posible; recomendado solo si el caso de uso lo justifica (coaching, toma de decisiones importante, contextos premium).',
	},
];

export const CUSTOM_MODEL_OPTION = '__custom__';

export function findCuratedModel(slug: string): CuratedModel | undefined {
	return CURATED_MODELS.find(m => m.slug === slug);
}
