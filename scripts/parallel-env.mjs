#!/usr/bin/env node
/* eslint-disable custom/no-raw-functions */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const WORKTREE_ROOT_RELATIVE = '../secrets-watch/worktrees';
const WORKTREE_ROOT = path.resolve(ROOT, WORKTREE_ROOT_RELATIVE);

const SLOT_COUNT = 8;
const DEFAULT_APP_PORT = 3000;
const DEFAULT_PG_PORT = 5432;
const DEFAULT_REDIS_PORT = 6379;
const OFFSET = 20000;

const REQUIRED_ENV_KEYS = [
	'COMPOSE_PROJECT_NAME',
	'PG_CONTAINER_NAME',
	'REDIS_CONTAINER_NAME',
	'PG_PORT',
	'REDIS_PORT',
	'PG_DATA_PATH',
	'REDIS_DATA_PATH',
	'APP_PORT',
	'DATABASE_URL',
	'REDIS_URL',
];

const command = process.argv[2];
const branchArg = process.argv[3] ?? '';

if (!command) {
	fail('Missing command');
}

await main();

async function main() {
	switch (command) {
		case 'create':
			requireBranch(branchArg);
			parallelCreate(branchArg);
			break;
		case 'start':
			requireBranch(branchArg);
			await parallelStart(branchArg);
			break;
		case 'status':
			parallelStatus(branchArg || undefined);
			break;
		case 'stop':
			requireBranch(branchArg);
			parallelStop(branchArg);
			break;
		case 'remove':
			requireBranch(branchArg);
			parallelRemove(branchArg);
			break;
		default:
			fail(`Unsupported command: ${command}`);
	}
}

function parallelCreate(branch) {
	const plan = buildPlan(branch);
	ensureRootEnvExists();

	const worktrees = listGitWorktrees();
	const worktreeByPath = new Map(worktrees.map((entry) => [entry.path, entry]));

	const occupiedEntry = worktreeByPath.get(plan.worktreePathAbs);
	if (occupiedEntry) {
		const occupiedSlug = normalizeIdentity(occupiedEntry.branch ?? '');
		if (occupiedSlug === plan.branchSlug) {
			fail(`Worktree already exists for branch '${branch}' at '${plan.worktreePathRelative}'`);
		}
		fail(
			`Sanitized worktree path '${plan.worktreePathRelative}' is occupied by different branch '${occupiedEntry.branch ?? 'unknown'}'; rename branch`,
		);
	}

	const managedEntries = worktrees.filter((entry) => isManagedWorktreePath(entry.path));
	for (const entry of managedEntries) {
		const metadata = readMetadata(entry.path);
		if (!metadata) {
			continue;
		}
		if (metadata.slot === plan.slot && metadata.branchSlug !== plan.branchSlug) {
			fail(
				`Slot collision: slot ${plan.slot} is already used by branch '${metadata.branch}'. Rename branch '${branch}'`,
			);
		}
	}

	run('workmux', ['add', branch, '--name', plan.workmuxHandle]);

	const updatedWorktrees = listGitWorktrees();
	const createdEntry = updatedWorktrees.find(
		(entry) => normalizeIdentity(entry.branch ?? '') === plan.branchSlug,
	);
	if (!createdEntry) {
		fail(`Unable to find created worktree for branch '${branch}'`);
	}
	if (createdEntry.path !== plan.worktreePathAbs) {
		fail(
			`Worktree path mismatch for branch '${branch}': expected '${plan.worktreePathRelative}', got '${createdEntry.path}'`,
		);
	}

	const worktreeEnvPath = path.join(plan.worktreePathAbs, '.env');
	if (fs.existsSync(worktreeEnvPath)) {
		fail(`Worktree .env already exists at '${worktreeEnvPath}'`);
	}

	fs.copyFileSync(path.join(ROOT, '.env'), worktreeEnvPath);
	applyEnvOverrides(worktreeEnvPath, plan);

	fs.mkdirSync(plan.pgDataPathAbs, { recursive: true });
	fs.mkdirSync(plan.redisDataPathAbs, { recursive: true });

	writeMetadata(plan);

	process.stdout.write(`parallel-create ok branch=${branch} slot=${plan.slot}\n`);
}

async function parallelStart(branch) {
	const plan = loadPlanFromMetadataOrFail(branch);
	const envPath = path.join(plan.worktreePathAbs, '.env');
	const env = parseEnvFile(envPath);
	for (const key of REQUIRED_ENV_KEYS) {
		if (!env[key]) {
			fail(`Missing required env key '${key}' in '${envPath}'`);
		}
	}

	const runtimeBefore = probeRuntime(plan);
	if (runtimeBefore.composePresent && !runtimeBefore.runningHealthy && runtimeBefore.anyRunning) {
		fail('Runtime is already running but unhealthy');
	}

	if (!runtimeBefore.runningHealthy) {
		run(
			'docker',
			[
				'compose',
				'-p',
				plan.composeProjectName,
				'--env-file',
				'.env',
				'up',
				'-d',
				'--wait',
				'postgres',
				'redis',
			],
			{ cwd: plan.worktreePathAbs },
		);
	}

	const runtimeAfter = probeRuntime(plan);
	if (!runtimeAfter.runningHealthy) {
		fail('Runtime health check failed');
	}

	await validateDatabaseConnectivity(env.DATABASE_URL);

	process.stdout.write(`parallel-start ok branch=${plan.branch} slot=${plan.slot}\n`);
}

function parallelStop(branch) {
	const plan = loadPlanFromMetadataOrFail(branch);
	const runtime = probeRuntime(plan);
	if (!runtime.anyRunning) {
		fail('Runtime is already stopped or missing');
	}

	run(
		'docker',
		['compose', '-p', plan.composeProjectName, '--env-file', '.env', 'stop', 'postgres', 'redis'],
		{ cwd: plan.worktreePathAbs },
	);

	process.stdout.write(`parallel-stop ok branch=${plan.branch} slot=${plan.slot}\n`);
}

function parallelRemove(branch) {
	const plan = loadPlanFromMetadataOrFail(branch);
	if (!fs.existsSync(plan.worktreePathAbs)) {
		fail(`Worktree directory missing: '${plan.worktreePathAbs}'`);
	}

	run(
		'docker',
		['compose', '-p', plan.composeProjectName, '--env-file', '.env', 'down', '--remove-orphans'],
		{ cwd: plan.worktreePathAbs },
	);

	run('workmux', ['close', plan.workmuxHandle]);

	fs.rmSync(plan.pgDataPathAbs, { recursive: true, force: true });
	fs.rmSync(plan.redisDataPathAbs, { recursive: true, force: true });
	fs.rmSync(plan.metadataPathAbs, { force: true });

	run('git', ['worktree', 'remove', plan.worktreePathAbs, '--force'], { cwd: ROOT });

	if (containerExists(plan.pgContainerName) || containerExists(plan.redisContainerName)) {
		fail('Container cleanup verification failed');
	}

	process.stdout.write(`parallel-remove ok branch=${plan.branch} slot=${plan.slot}\n`);
}

function parallelStatus(branch) {
	if (branch) {
		const plan = buildPlan(branch);
		if (fs.existsSync(plan.worktreePathAbs)) {
			const metadata = readMetadata(plan.worktreePathAbs);
			if (!metadata) {
				fail(`Missing metadata for existing worktree '${plan.worktreePathRelative}'`);
			}
		}
	}

	const entries = listGitWorktrees().filter((entry) => isManagedWorktreePath(entry.path));
	const rows = [];

	for (const entry of entries) {
		const metadata = readMetadata(entry.path);
		if (!metadata) {
			rows.push({
				branch: entry.branch ?? '-',
				slot: '-',
				app: '-',
				db: '-',
				redis: '-',
				state: 'error',
			});
			continue;
		}

		const rowPlan = planFromMetadata(metadata, entry.path);
		if (branch && normalizeIdentity(metadata.branch) !== normalizeIdentity(branch)) {
			continue;
		}

		rows.push({
			branch: metadata.branch,
			slot: String(metadata.slot),
			app: String(metadata.ports.app),
			db: String(metadata.ports.postgres),
			redis: String(metadata.ports.redis),
			state: classifyState(probeRuntime(rowPlan)),
		});
	}

	if (branch && rows.length === 0) {
		fail(`No managed worktree found for branch '${branch}'`);
	}

	process.stdout.write('branch slot app db redis state\n');
	for (const row of rows) {
		process.stdout.write(
			`${row.branch} ${row.slot} ${row.app} ${row.db} ${row.redis} ${row.state}\n`,
		);
	}
}

function requireBranch(branch) {
	const value = branch.trim();
	if (!value) {
		fail('Missing BRANCH');
	}
	if (value.endsWith('/')) {
		fail('Invalid BRANCH: trailing slash is not allowed');
	}
}

function buildPlan(branchInput) {
	const branch = branchInput.trim();
	requireBranch(branch);

	const branchSlug = normalizeIdentity(branch);
	if (!branchSlug) {
		fail(`Branch normalizes to empty slug: '${branch}'`);
	}

	const segments = branch
		.split('/')
		.filter((segment) => segment.length > 0)
		.map((segment) => slugifySegment(segment));
	if (segments.length === 0) {
		fail(`Invalid BRANCH: '${branch}'`);
	}

	const branchPath = segments.join('/');
	const worktreePathRelative = path.posix.join(WORKTREE_ROOT_RELATIVE, branchPath);
	const worktreePathAbs = path.resolve(ROOT, worktreePathRelative);

	const hashHex = createHash('sha256').update(branchSlug).digest('hex');
	const n = Number.parseInt(hashHex.slice(0, 8), 16);
	const slot = (n % SLOT_COUNT) + 1;

	const appPort = OFFSET + DEFAULT_APP_PORT + slot;
	const postgresPort = OFFSET + DEFAULT_PG_PORT + slot;
	const redisPort = OFFSET + DEFAULT_REDIS_PORT + slot;

	const pgDbName = `secrets_watch_${slot}`;

	return {
		version: 1,
		branch,
		branchSlug,
		slot,
		worktreePathRelative,
		worktreePathAbs,
		ports: { app: appPort, postgres: postgresPort, redis: redisPort },
		composeProjectName: `sw_slot_${slot}_${branchSlug}`,
		pgContainerName: `sw-pg-${slot}-${branchSlug}`,
		redisContainerName: `sw-redis-${slot}-${branchSlug}`,
		pgDbName,
		databaseUrl: `postgresql://secrets_watch:secrets_watch@localhost:${postgresPort}/${pgDbName}`,
		redisUrl: `redis://localhost:${redisPort}`,
		pgDataPathAbs: path.join(worktreePathAbs, 'pg_data'),
		redisDataPathAbs: path.join(worktreePathAbs, 'redis_data'),
		metadataPathAbs: path.join(worktreePathAbs, '.parallel-env.json'),
		workmuxHandle: branchPath,
	};
}

function ensureRootEnvExists() {
	if (!fs.existsSync(path.join(ROOT, '.env'))) {
		fail(`Missing root .env at '${path.join(ROOT, '.env')}'`);
	}
}

function applyEnvOverrides(envPath, plan) {
	// eslint-disable-next-line custom/no-mutable-variables
	let content = fs.readFileSync(envPath, 'utf8');
	const overrides = {
		PORT: String(plan.ports.app),
		DOMAIN: `localhost:${plan.ports.app}`,
		DATABASE_URL: plan.databaseUrl,
		REDIS_URL: plan.redisUrl,
		COMPOSE_PROJECT_NAME: plan.composeProjectName,
		PG_CONTAINER_NAME: plan.pgContainerName,
		REDIS_CONTAINER_NAME: plan.redisContainerName,
		PG_PORT: String(plan.ports.postgres),
		REDIS_PORT: String(plan.ports.redis),
		PG_DATA_PATH: plan.pgDataPathAbs,
		REDIS_DATA_PATH: plan.redisDataPathAbs,
		APP_PORT: String(plan.ports.app),
		PG_DB_NAME: plan.pgDbName,
	};

	for (const [key, value] of Object.entries(overrides)) {
		content = upsertEnvKey(content, key, value);
	}

	fs.writeFileSync(envPath, content);
}

function upsertEnvKey(content, key, value) {
	const escaped = escapeRegExp(key);
	const regex = new RegExp(`^${escaped}=.*$`, 'm');
	if (regex.test(content)) {
		return content.replace(regex, `${key}=${value}`);
	}
	if (!content.endsWith('\n')) {
		content += '\n';
	}
	return `${content}${key}=${value}\n`;
}

function writeMetadata(plan) {
	const metadata = {
		version: 1,
		branch: plan.branch,
		branchSlug: plan.branchSlug,
		slot: plan.slot,
		worktreePath: plan.worktreePathRelative,
		ports: plan.ports,
		composeProjectName: plan.composeProjectName,
		containers: {
			postgres: plan.pgContainerName,
			redis: plan.redisContainerName,
		},
		database: {
			name: plan.pgDbName,
			url: plan.databaseUrl,
		},
		redis: {
			url: plan.redisUrl,
		},
		createdAt: new Date().toISOString(),
	};

	fs.writeFileSync(plan.metadataPathAbs, `${JSON.stringify(metadata, null, 2)}\n`);
}

function loadPlanFromMetadataOrFail(branch) {
	const plan = buildPlan(branch);
	if (!fs.existsSync(plan.worktreePathAbs)) {
		fail(`Worktree does not exist for branch '${branch}' at '${plan.worktreePathRelative}'`);
	}
	const metadata = readMetadata(plan.worktreePathAbs);
	if (!metadata) {
		fail(`Missing metadata at '${plan.metadataPathAbs}'`);
	}
	const metadataPlan = planFromMetadata(metadata, plan.worktreePathAbs);
	if (!plansMatch(plan, metadataPlan)) {
		fail('Metadata mismatch detected for existing worktree');
	}
	return metadataPlan;
}

function plansMatch(expected, actual) {
	return (
		expected.branchSlug === actual.branchSlug &&
		expected.slot === actual.slot &&
		expected.composeProjectName === actual.composeProjectName &&
		expected.ports.app === actual.ports.app &&
		expected.ports.postgres === actual.ports.postgres &&
		expected.ports.redis === actual.ports.redis
	);
}

function planFromMetadata(metadata, worktreePathAbs) {
	const worktreePathRelative = path.posix.join(
		WORKTREE_ROOT_RELATIVE,
		path.relative(WORKTREE_ROOT, worktreePathAbs).split(path.sep).join('/'),
	);
	return {
		version: metadata.version,
		branch: metadata.branch,
		branchSlug: metadata.branchSlug,
		slot: metadata.slot,
		worktreePathRelative,
		worktreePathAbs,
		ports: metadata.ports,
		composeProjectName: metadata.composeProjectName,
		pgContainerName: metadata.containers.postgres,
		redisContainerName: metadata.containers.redis,
		pgDbName: metadata.database.name,
		databaseUrl: metadata.database.url,
		redisUrl: metadata.redis.url,
		pgDataPathAbs: path.join(worktreePathAbs, 'pg_data'),
		redisDataPathAbs: path.join(worktreePathAbs, 'redis_data'),
		metadataPathAbs: path.join(worktreePathAbs, '.parallel-env.json'),
		workmuxHandle: sanitizeBranchPath(metadata.branch),
	};
}

function parseEnvFile(envPath) {
	if (!fs.existsSync(envPath)) {
		fail(`Missing env file '${envPath}'`);
	}
	const content = fs.readFileSync(envPath, 'utf8');
	const env = {};
	for (const line of content.split(/\r?\n/)) {
		if (!line || line.startsWith('#')) {
			continue;
		}
		const index = line.indexOf('=');
		if (index < 0) {
			continue;
		}
		const key = line.slice(0, index).trim();
		const value = line.slice(index + 1).trim();
		env[key] = value;
	}
	return env;
}

function listGitWorktrees() {
	const result = runAllowFailure('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT });
	if (!result.ok) {
		fail(result.error);
	}
	const content = result.stdout;
	if (!content.includes('worktree ')) {
		return parseLegacyWorktreeList(content);
	}

	const blocks = content.trim().split(/\n\n+/);
	const entries = [];
	for (const block of blocks) {
		if (!block.trim()) {
			continue;
		}
		let worktreePath = '';
		let branch = '';
		for (const line of block.split('\n')) {
			if (line.startsWith('worktree ')) {
				worktreePath = path.resolve(expandHome(line.slice('worktree '.length).trim()));
			}
			if (line.startsWith('branch refs/heads/')) {
				branch = line.slice('branch refs/heads/'.length).trim();
			}
		}
		if (!worktreePath) {
			continue;
		}
		entries.push({ path: worktreePath, branch });
	}
	return entries;
}

function parseLegacyWorktreeList(content) {
	const entries = [];
	for (const line of content.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}
		const match = line.match(/^(\S+)\s+\S+\s+\[(.+)\]$/);
		if (!match) {
			continue;
		}
		entries.push({
			path: path.resolve(expandHome(match[1])),
			branch: match[2],
		});
	}
	return entries;
}

function readMetadata(worktreePathAbs) {
	const metadataPath = path.join(worktreePathAbs, '.parallel-env.json');
	if (!fs.existsSync(metadataPath)) {
		return null;
	}
	const raw = fs.readFileSync(metadataPath, 'utf8');
	try {
		return JSON.parse(raw);
	} catch {
		fail(`Invalid metadata JSON at '${metadataPath}'`);
	}
}

function probeRuntime(plan) {
	const composePresent = hasComposeProject(plan.composeProjectName);
	const pgState = inspectContainer(plan.pgContainerName);
	const redisState = inspectContainer(plan.redisContainerName);
	const runningHealthy =
		composePresent &&
		pgState.exists &&
		redisState.exists &&
		pgState.running &&
		redisState.running &&
		pgState.healthy &&
		redisState.healthy;
	const anyRunning =
		(pgState.exists && pgState.running) || (redisState.exists && redisState.running);
	return {
		composePresent,
		postgres: pgState,
		redis: redisState,
		runningHealthy,
		anyRunning,
	};
}

function classifyState(runtime) {
	if (runtime.runningHealthy) {
		return 'running';
	}
	if (!runtime.composePresent && !runtime.postgres.exists && !runtime.redis.exists) {
		return 'stopped';
	}
	if (runtime.postgres.running && !runtime.postgres.healthy) {
		return 'error';
	}
	if (runtime.redis.running && !runtime.redis.healthy) {
		return 'error';
	}
	if (runtime.postgres.running !== runtime.redis.running) {
		return 'error';
	}
	if (!runtime.postgres.running && !runtime.redis.running) {
		return 'stopped';
	}
	return 'error';
}

function hasComposeProject(projectName) {
	const result = runAllowFailure('docker', [
		'ps',
		'-a',
		'--filter',
		`label=com.docker.compose.project=${projectName}`,
		'--format',
		'{{.ID}}',
	]);
	if (!result.ok) {
		fail(result.error);
	}
	return result.stdout.trim().length > 0;
}

function inspectContainer(containerName) {
	const result = runAllowFailure('docker', [
		'inspect',
		'--format',
		'{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
		containerName,
	]);
	if (!result.ok) {
		return { exists: false, running: false, healthy: false };
	}
	const [status, health] = result.stdout.trim().split('|');
	return {
		exists: true,
		running: status === 'running',
		healthy: health === 'healthy',
	};
}

function containerExists(containerName) {
	const result = runAllowFailure('docker', [
		'ps',
		'-a',
		'--filter',
		`name=^${containerName}$`,
		'--format',
		'{{.Names}}',
	]);
	if (!result.ok) {
		fail(result.error);
	}
	return result.stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.includes(containerName);
}

async function validateDatabaseConnectivity(databaseUrl) {
	let Pool;
	try {
		({ Pool } = await import('pg'));
	} catch {
		fail('Database validation failed: missing pg dependency');
	}

	const pool = new Pool({ connectionString: databaseUrl });
	try {
		await pool.query('SELECT 1');
	} catch {
		fail('Database connectivity validation failed using DATABASE_URL');
	} finally {
		await pool.end();
	}
}

function run(commandName, args, options = {}) {
	const result = runAllowFailure(commandName, args, options);
	if (!result.ok) {
		fail(result.error);
	}
	return result.stdout;
}

function runAllowFailure(commandName, args, options = {}) {
	const result = spawnSync(commandName, args, {
		cwd: options.cwd ?? ROOT,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	if (result.error) {
		return {
			ok: false,
			error: `Command failed to execute: ${commandName} ${args.join(' ')} (${result.error.message})`,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
		};
	}
	if (result.status !== 0) {
		const stderr = (result.stderr ?? '').trim();
		const stdout = (result.stdout ?? '').trim();
		const details = stderr || stdout || 'no output';
		return {
			ok: false,
			error: `Command failed: ${commandName} ${args.join(' ')} (${details})`,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
		};
	}
	return {
		ok: true,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
}

function slugifySegment(segment) {
	const lower = segment.toLowerCase();
	const slug = lower
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-/, '')
		.replace(/-$/, '');
	if (!slug) {
		fail(`Invalid branch segment '${segment}' after sanitization`);
	}
	return slug;
}

function sanitizeBranchPath(branch) {
	return branch
		.split('/')
		.filter((segment) => segment.length > 0)
		.map((segment) => slugifySegment(segment))
		.join('/');
}

function normalizeIdentity(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-/, '')
		.replace(/-$/, '');
}

function isManagedWorktreePath(worktreePathAbs) {
	const managedPrefix = `${WORKTREE_ROOT}${path.sep}`;
	return worktreePathAbs === WORKTREE_ROOT || worktreePathAbs.startsWith(managedPrefix);
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandHome(value) {
	if (value.startsWith('~/')) {
		const home = process.env.HOME;
		if (!home) {
			return value;
		}
		return path.join(home, value.slice(2));
	}
	return value;
}

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}
