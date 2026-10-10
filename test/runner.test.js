import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { FfCliError, buildArgs, createRunner, formatOption, resolveEditorRoot, resolveModule } from '../lib/runner.js';
import { makeFakeSpawn } from './support.js';

const BASE = { pythonPath: 'python', editorRoot: 'C:/editor', cliModule: 'core.cli', firefightRoot: '', workspace: '', cwd: 'C:/work', timeoutMs: 5000 };

test('resolveEditorRoot needs a checkout and resolveModule falls back to core.cli', () => {
    assert.equal(resolveEditorRoot({ editorRoot: 'C:/editor' }), 'C:/editor');
    assert.throws(() => resolveEditorRoot({ editorRoot: '' }), FfCliError);
    assert.equal(resolveModule({ cliModule: 'core.cli' }), 'core.cli');
    assert.equal(resolveModule({ cliModule: '' }), 'core.cli');
});

test('formatOption renders booleans the way the CLI parses them', () => {
    assert.equal(formatOption(true), '1');
    assert.equal(formatOption(false), '0');
    assert.equal(formatOption(200), '200');
});

test('buildArgs is `-m core.cli <scope> <command> [selector] [k=v] --json`', () => {
    assert.deepEqual(buildArgs('core.cli', { scope: 'Mod', command: 'list', options: {} }), ['-m', 'core.cli', 'Mod', 'list', '--json']);
    assert.deepEqual(
        buildArgs('core.cli', { scope: 'Firefight', command: 'find', selector: 'Weapons', options: { tag: 'flavour', ignore_case: true, limit: 5 } }),
        ['-m', 'core.cli', 'Firefight', 'find', 'Weapons', 'tag=flavour', 'ignore_case=1', 'limit=5', '--json'],
    );
});

test('buildArgs drops empty options and keeps --json last', () => {
    const args = buildArgs('core.cli', { scope: 'Mod', command: 'deps', selector: '', options: { value: 'WEAPON_PISTOL_P38', kind: '', limit: undefined } });
    assert.deepEqual(args, ['-m', 'core.cli', 'Mod', 'deps', 'value=WEAPON_PISTOL_P38', '--json']);
});

test('run returns the CLI payload and the argv it used', async () => {
    const { spawnImpl, calls } = makeFakeSpawn(() => ({ stdout: '{"ok":true}\n', code: 0 }));
    const run = createRunner(BASE, spawnImpl);
    const result = await run({ scope: 'Firefight', command: 'stats', options: {} });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '{"ok":true}\n');
    assert.equal(result.timedOut, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'python');
    assert.deepEqual(calls[0].argv, ['-m', 'core.cli', 'Firefight', 'stats', '--json']);
    assert.equal(calls[0].options.cwd, 'C:/work');
    assert.equal(calls[0].options.env.PYTHONPATH.split(path.delimiter)[0], 'C:/editor');
    assert.equal(calls[0].options.env.PYTHONUTF8, '1');
    assert.equal(calls[0].options.windowsHide, true);
});

test('run falls back to the editor checkout as the working directory', async () => {
    const { spawnImpl, calls } = makeFakeSpawn(() => ({ stdout: '{}\n', code: 0 }));
    const run = createRunner({ ...BASE, cwd: '' }, spawnImpl);
    await run({ scope: 'Mod', command: 'list', options: {} });
    assert.equal(calls[0].options.cwd, 'C:/editor');
});

test('run reports a non-zero exit code without failing when the process ran', async () => {
    const { spawnImpl } = makeFakeSpawn(() => ({ stdout: '', stderr: 'boom\n', code: 2 }));
    const result = await createRunner(BASE, spawnImpl)({ scope: 'Mod', command: 'list', options: {} });
    assert.equal(result.code, 2);
    assert.equal(result.stderr, 'boom\n');
    assert.equal(result.failure, undefined);
});

test('run reports a process that could not be started as a failure', async () => {
    const error = new Error('spawn python ENOENT');
    const { spawnImpl } = makeFakeSpawn(() => ({ error }));
    const result = await createRunner(BASE, spawnImpl)({ scope: 'Mod', command: 'list', options: {} });
    assert.equal(result.failure, error);
});

test('run kills the child and flags a timeout', async () => {
    const { spawnImpl, calls } = makeFakeSpawn(() => ({ hold: true }));
    const run = createRunner({ ...BASE, timeoutMs: 20 }, spawnImpl);
    const result = await run({ scope: 'Mod', command: 'check', options: {} });
    assert.equal(result.timedOut, true);
    assert.equal(calls[0].child.killed, true);
});

test('run kills the child and flags an abort', async () => {
    const { spawnImpl, calls } = makeFakeSpawn(() => ({ hold: true }));
    const controller = new AbortController();
    const run = createRunner(BASE, spawnImpl);
    const pending = run({ scope: 'Mod', command: 'check', options: {} }, { signal: controller.signal });
    controller.abort();
    const result = await pending;
    assert.equal(result.aborted, true);
    assert.equal(calls[0].child.killed, true);
});
