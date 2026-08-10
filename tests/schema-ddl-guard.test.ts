import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ddlPattern = /\b(?:alter|create|drop)\s+table\b|\badd\s+column\b/iu;
const checkedRoots = ['scripts', 'src', 'tests', 'vitest.setup.ts'];
const ignoredPaths = new Set(['tests/schema-ddl-guard.test.ts']);
const checkedExtensions = new Set(['.js', '.mjs', '.ts', '.tsx']);

const listFiles = (path: string): string[] => {
	const stats = statSync(path);

	if (stats.isFile()) {
		return [path];
	}

	return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
};

const hasCheckedExtension = (path: string) => {
	return [...checkedExtensions].some((extension) => path.endsWith(extension));
};

describe('schema DDL placement', () => {
	it('keeps schema-changing SQL in drizzle migrations', () => {
		const root = process.cwd();
		const violations = checkedRoots.flatMap((entry) => {
			return listFiles(join(root, entry))
				.map((path) => relative(root, path))
				.filter((path) => hasCheckedExtension(path))
				.filter((path) => !ignoredPaths.has(path))
				.filter((path) => ddlPattern.test(readFileSync(join(root, path), 'utf-8')));
		});

		expect(violations).toEqual([]);
	});
});
