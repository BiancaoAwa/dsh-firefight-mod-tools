/**
 * One CLI call, normalized into the canonical value the tools return.
 *
 * The rule is payload-first: a stdout that parses as JSON is the answer even
 * when the CLI exits non-zero, because `check` reports findings that way. Only a
 * non-JSON answer becomes an error value, and a process that could not be
 * started at all is an infrastructure failure the registry reports as such.
 */
import { FfCliError, resolveTimeoutMs } from './runner.js';
import { errorValue } from './render.js';

/** Parse the CLI's JSON payload; `undefined` when stdout is not JSON. */
export function parsePayload(stdout) {
    const text = typeof stdout === 'string' ? stdout.trim() : '';
    if (text.length === 0)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}

/** First `count` non-empty lines, so a failure detail stays readable. */
export function firstLines(text, count = 12) {
    return text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .slice(0, count)
        .join('\n');
}

/**
 * Run one call and return its canonical value.
 * @param run - the runner built by {@link createRunner}.
 * @param config - resolved plugin config (python path, timeout).
 * @param call - `{ scope, command, selector, options }`.
 * @param exec - harness execution context; only its cancellation signal is used.
 * @returns the CLI payload, or an error value.
 */
export async function invokeCli(run, config, call, exec) {
    const result = await run(call, { signal: exec?.signal });
    if (result.failure !== undefined) {
        throw new FfCliError(`cannot run ${config.pythonPath}: ${result.failure.message}`, 'check pythonPath and editorRoot in the plugin config');
    }
    if (result.aborted === true)
        return errorValue('cancelled', 'the call was cancelled before the editor CLI answered');
    if (result.timedOut === true) {
        return errorValue('timeout', `the editor CLI did not answer within ${resolveTimeoutMs(config)} ms`, 'raise timeoutMs in the plugin config, or narrow the selector');
    }
    const payload = parsePayload(result.stdout);
    if (payload !== undefined)
        return payload;
    const detail = firstLines(result.stderr.length > 0 ? result.stderr : result.stdout);
    if (result.code === 0) {
        return errorValue('empty-output', 'the editor CLI printed no JSON payload', 'run the same command by hand to see its text output', detail);
    }
    return errorValue(result.code === 2 ? 'usage' : 'cli-error', `the editor CLI exited with code ${result.code}`, 'check the selector and the options; run the same command by hand for the full message', detail);
}
