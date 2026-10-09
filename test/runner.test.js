import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { FfCliError, buildArgs, createRunner, formatOption, resolveScript } from '../lib/runner.js';
import { makeFakeSpawn } from './support.js';

const BASE = { pythonPath: 'python', scriptPath: 'C:/editor/ff.py', editorRoot: '', firefightRoot: '', workspace: '', cwd: 'C:/work', timeoutMs: 5000 };

test('resolveScript prefers scriptPath and falls back to editorRoot', () => {
    assert.equal(resolveScript({ scriptPath: 'C:/editor/ff.py', editorRoot: 'C:/other' }), 'C:/editor/ff.py');
    assert.equal(resolveScript({ scriptPath: '', editorRoot: 'C:/editor' }), path.join('C:/editor', 'ff.py'));
    assert.throws(() => resolveScript({ scriptPath: '', editorRoot: '' }), FfCliError);
});

test('formatOption renders booleans the way the CLI parses them', () => {
    assert.equal(formatOption(true), '1');
    assert.equal(formatOption(false), '0');
    assert.equal(formatOption(200), '200');
});

test('buildArgs is `ff.py <scope> <command> [selector] [k=v] --json`', () => {
    assert.deepEqual(buildArgs('ff.py', { scope: 'Mod', command: 'list', options: {} }), ['ff.py', 'Mod', 'list', '--json']);
    assert.deepEqual(
        buildArgs('ff.py', { scope: 'Firefight', command: 'find', selector: 'Weapons', options: { tag: 'flavour', ignore_case: true, limit: 5 } }),
        ['ff.py', 'Firefight', 'find', 'Weapons', 'tag=flavour', 'ignore_case=1', 'limit=5', '--json'],
    );
});

test('buildArgs drops empty options and keeps --json last', () => {
    const args = buildArgs('ff.py', { scope: 'Mod', command: 'deps', selector: '', options: { value: 'WEAPON_PISTOL_P38', kind: '', limit: undefined } });
    assert.deepEqual(args, ['ff.py', 'Mod', 'deps', 'value=WEAPON_PISTOL_P38', '--json']);
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
    assert.deepEqual(calls[0].argv, ['C:/editor/ff.py', 'Firefight', 'stats', '--json']);
    assert.equal(calls[0].options.cwd, 'C:/work');
    assert.equal(calls[0].options.env.PYTHONUTF8, '1');
    assert.equal(calls[0].options.windowsHide, true);
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
