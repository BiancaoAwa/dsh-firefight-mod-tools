/**
 * Runs the firefight-mod-editor CLI (`python -m core.cli`) and returns its raw output.
 *
 * Deliberately free of the harness API: the spawn implementation is injected so
 * the runner can be unit tested without Python, and so the argv contract of the
 * CLI stays in one place.
 *
 * Shape of one call: `python -m core.cli <scope> <command> [selector] [key=value ...] --json`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Reading more than this is a bug in the CLI, not a payload worth keeping. */
const MAX_STDOUT_CHARS = 4_000_000;
const MAX_STDERR_CHARS = 20_000;

/** Raised when the CLI cannot be started at all; the plugin treats it as an infrastructure failure. */
export class FfCliError extends Error {
    constructor(message, guidance) {
        super(message);
        this.name = 'FfCliError';
        this.guidance = guidance;
    }
}

/** Editor checkout configured for this instance; it must be the directory holding `core/`. */
export function resolveEditorRoot(config) {
    if (typeof config.editorRoot === 'string' && config.editorRoot.length > 0)
        return config.editorRoot;
    throw new FfCliError('no editor checkout configured: editorRoot is not set', 'set editorRoot to a firefight-mod-editor checkout (the directory holding core/)');
}

/** Module the CLI is started with; the shipped entry is `core.cli`. */
export function resolveModule(config) {
    return typeof config.cliModule === 'string' && config.cliModule.length > 0 ? config.cliModule : 'core.cli';
}

/** Render one option value the way the CLI parses it. */
export function formatOption(value) {
    if (typeof value === 'boolean')
        return value ? '1' : '0';
    return String(value);
}

/** argv of one call; empty option values are dropped, the CLI has its own defaults. */
export function buildArgs(module, call) {
    const args = ['-m', module, call.scope, call.command];
    if (typeof call.selector === 'string' && call.selector.length > 0)
        args.push(call.selector);
    for (const [key, value] of Object.entries(call.options ?? {})) {
        if (value === undefined || value === null || value === '')
            continue;
        args.push(`${key}=${formatOption(value)}`);
    }
    args.push('--json');
    return args;
}

export const DEFAULT_TIMEOUT_MS = 60000;

/** The timeout actually used for one config, so messages and timers never disagree. */
export function resolveTimeoutMs(config) {
    return typeof config?.timeoutMs === 'number' && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
}

/**
 * Build the runner for one plugin instance.
 * @param config - resolved plugin config.
 * @param spawnImpl - injected `spawn`, for tests.
 * @returns `run(call, options)` resolving to `{ code, stdout, stderr, timedOut, aborted, argv }`,
 *   or `{ failure }` when the process could not be started.
 */
export function createRunner(config, spawnImpl = spawn) {
    const timeoutMs = resolveTimeoutMs(config);
    return function run(call, options = {}) {
        const editorRoot = resolveEditorRoot(config);
        const args = buildArgs(resolveModule(config), call);
        const signal = options.signal;
        return new Promise((resolve) => {
            let child;
            try {
                child = spawnImpl(config.pythonPath, args, {
                    cwd: config.cwd || editorRoot,
                    // `-m core.cli` resolves through PYTHONPATH, so a custom `cwd` stays usable.
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUTF8: '1',
                        PYTHONPATH: [editorRoot, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
                    },
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
            }
            catch (error) {
                resolve({ failure: error, argv: args });
                return;
            }
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let aborted = false;
            let settled = false;
            let timer;
            const finish = (code, failure) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                resolve({ code, stdout, stderr, timedOut, aborted, argv: args, failure });
            };
            const onAbort = () => {
                aborted = true;
                child.kill();
            };
            timer = setTimeout(() => {
                timedOut = true;
                child.kill();
            }, timeoutMs);
            if (signal !== undefined) {
                if (signal.aborted)
                    onAbort();
                else
                    signal.addEventListener('abort', onAbort, { once: true });
            }
            child.stdout?.on('data', (chunk) => {
                if (stdout.length < MAX_STDOUT_CHARS)
                    stdout += String(chunk);
            });
            child.stderr?.on('data', (chunk) => {
                if (stderr.length < MAX_STDERR_CHARS)
                    stderr += String(chunk);
            });
            child.on('error', (error) => finish(null, error));
            child.on('close', (code) => finish(code ?? null, undefined));
        });
    };
}
