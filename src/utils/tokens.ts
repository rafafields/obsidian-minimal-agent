export function countTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

export function calcCost(promptTokens: number, completionTokens: number, promptPerToken: number, completionPerToken: number): number {
	return promptTokens * promptPerToken + completionTokens * completionPerToken;
}

export function formatCost(usd: number): string {
	if (usd === 0)    return '$0.00';
	if (usd < 0.0001) return '< $0.0001';
	if (usd < 0.01)   return `$${usd.toFixed(4)}`;
	if (usd < 1)      return `$${usd.toFixed(3)}`;
	return `$${usd.toFixed(2)}`;
}
