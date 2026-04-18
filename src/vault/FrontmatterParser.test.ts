import { describe, it, expect } from 'vitest';
import { FrontmatterParser } from './FrontmatterParser';

const p = new FrontmatterParser();

describe('parse', () => {
	it('returns empty frontmatter when no delimiter', () => {
		const result = p.parse('just body text');
		expect(result.frontmatter).toEqual({});
		expect(result.body).toBe('just body text');
	});

	it('parses scalar fields', () => {
		const raw = '---\ntitle: Hello\ncount: 3\nactive: true\n---\n\nbody here';
		const { frontmatter, body } = p.parse(raw);
		expect(frontmatter['title']).toBe('Hello');
		expect(frontmatter['count']).toBe(3);
		expect(frontmatter['active']).toBe(true);
		expect(body).toBe('body here');
	});

	it('parses array fields', () => {
		const raw = '---\ntags:\n  - alpha\n  - beta\n---\n';
		const { frontmatter } = p.parse(raw);
		expect(frontmatter['tags']).toEqual(['alpha', 'beta']);
	});

	it('parses null field', () => {
		const raw = '---\nexpires_at:\n---\n';
		const { frontmatter } = p.parse(raw);
		expect(frontmatter['expires_at']).toBeNull();
	});

	it('returns raw content when no closing delimiter', () => {
		const raw = '---\ntitle: Orphan';
		const { frontmatter, body } = p.parse(raw);
		expect(frontmatter).toEqual({});
		expect(body).toBe(raw);
	});
});

describe('serialize', () => {
	it('round-trips scalar fields', () => {
		const fm = { title: 'Hello', count: 3, active: true };
		const result = p.serialize(fm, 'body');
		const reparsed = p.parse(result);
		expect(reparsed.frontmatter['title']).toBe('Hello');
		expect(reparsed.frontmatter['count']).toBe(3);
		expect(reparsed.frontmatter['active']).toBe(true);
		expect(reparsed.body).toBe('body');
	});

	it('round-trips array fields', () => {
		const fm = { tags: ['alpha', 'beta'] };
		const result = p.serialize(fm, '');
		const reparsed = p.parse(result);
		expect(reparsed.frontmatter['tags']).toEqual(['alpha', 'beta']);
	});

	it('quotes values with special characters', () => {
		const result = p.serialize({ key: 'value: with colon' }, '');
		expect(result).toContain('"value: with colon"');
	});

	it('omits body section when body is empty', () => {
		const result = p.serialize({ k: 'v' }, '');
		expect(result.endsWith('---')).toBe(true);
	});
});

describe('updateSection', () => {
	it('replaces an existing section body', () => {
		const raw = '# Doc\n\n## Summary\n\nold content\n\n## Details\n\ndetails here';
		const result = p.updateSection(raw, 'Summary', 'new content');
		expect(result).toContain('new content');
		expect(result).not.toContain('old content');
		expect(result).toContain('## Details');
	});

	it('appends new section when header not found', () => {
		const raw = '# Doc\n\nsome text';
		const result = p.updateSection(raw, 'New Section', 'section body');
		expect(result).toContain('## New Section');
		expect(result).toContain('section body');
	});

	it('does not disturb other sections', () => {
		const raw = '## A\n\ncontent A\n\n## B\n\ncontent B';
		const result = p.updateSection(raw, 'A', 'new A');
		expect(result).toContain('content B');
		expect(result).not.toContain('content A');
	});
});
