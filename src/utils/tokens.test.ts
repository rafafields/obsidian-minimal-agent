import { describe, it, expect } from 'vitest';
import { countTokens, calcCost, formatCost } from './tokens';

describe('countTokens', () => {
	it('returns ceil(length/4)', () => {
		expect(countTokens('')).toBe(0);
		expect(countTokens('abcd')).toBe(1);
		expect(countTokens('abcde')).toBe(2);
		expect(countTokens('a'.repeat(100))).toBe(25);
	});
});

describe('calcCost', () => {
	it('sums prompt and completion costs', () => {
		expect(calcCost(1000, 500, 0.000001, 0.000002)).toBeCloseTo(0.002);
		expect(calcCost(0, 0, 1, 1)).toBe(0);
	});
});

describe('formatCost', () => {
	it('formats zero', () => {
		expect(formatCost(0)).toBe('$0.00');
	});

	it('formats very small values', () => {
		expect(formatCost(0.00001)).toBe('< $0.0001');
	});

	it('formats sub-cent values with 4 decimal places', () => {
		expect(formatCost(0.0023)).toBe('$0.0023');
	});

	it('formats sub-dollar values with 3 decimal places', () => {
		expect(formatCost(0.05)).toBe('$0.050');
	});

	it('formats dollar+ values with 2 decimal places', () => {
		expect(formatCost(1.5)).toBe('$1.50');
	});
});
