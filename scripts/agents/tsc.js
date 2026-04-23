import { run } from './_shared/runner.js';
import { buildResult, buildError } from './_shared/format.js';
import { stripAnsi } from './_shared/truncate.js';

function parseArgs(args) {
	const opts = { verbose: false, timeout: 120_000 };
	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--verbose') {
			opts.verbose = true;
		} else if (args[i] === '--timeout' && args[i + 1]) {
			opts.timeout = Number(args[++i]);
		}
	}
	return opts;
}

function parseTscOutput(output) {
	const errors = [];
	let errorCount = 0;

	const lines = stripAnsi(output).split('\n');
	for (const line of lines) {
		const match = line.match(/^([^\n(]+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
		if (match) {
			errorCount++;
			errors.push(buildError(`${match[4]}: ${match[5]}`, match[1], Number(match[2])));
		}
	}

	if (errorCount === 0 && output.includes('error')) {
		const foundLine = lines.find((l) => l.trim().startsWith('error'));
		if (foundLine) {
			errorCount = 1;
			errors.push(buildError(foundLine.trim()));
		}
	}

	return { errorCount, errors };
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	const result = await run('npx', ['tsc', '--noEmit'], {
		timeout: opts.timeout,
	});

	if (result.crashed) {
		const out = buildResult('tsc', 'fail', 'Execution failed', {}, [
			buildError('Process crashed or invalid output'),
		]);
		process.stdout.write(JSON.stringify(out));
		return;
	}

	const combined = result.stdout + '\n' + result.stderr;
	const { errorCount, errors } = parseTscOutput(combined);

	const status = errorCount > 0 ? 'fail' : 'pass';
	const summary =
		errorCount > 0
			? `TypeScript: ${errorCount} error${errorCount !== 1 ? 's' : ''}`
			: 'TypeScript: OK';

	const out = buildResult('tsc', status, summary, { errors: errorCount }, errors);

	process.stdout.write(JSON.stringify(out));
}

main().catch(() => {
	process.stdout.write(
		JSON.stringify({
			status: 'fail',
			tool: 'tsc',
			summary: 'Execution failed',
			errors: [{ message: 'Process crashed or invalid output' }],
		}),
	);
});
