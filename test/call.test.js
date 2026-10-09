import assert from 'node:assert/strict';
import test from 'node:test';
import { firstLines, invokeCli, parsePayload } from '../lib/call.js';
import { FfCliError } from '../lib/runner.js';

const CONFIG = { pythonPath: 'python', timeoutMs: 60000 };
const CALL = { scope: 'Mod', command: 'list', options: {} };

/** Run `invokeCli` against a stubbed CLI result. */
function withResult(result) {
    return invokeCli(async () => result, CONFIG, CALL, undefined);
}

test('parsePayload accepts JSON and rejects anything else', () => {
    assert.deepEqual(parsePayload(' {"a":1} '), { a: 1 });
    assert.equal(parsePayload('not json'), undefined);
    assert.equal(parsePayload(''), undefined);
});

test('firstLines drops blank lines and caps the length', () => {
    assert.equal(firstLines('a\n\nb\n'), 'a\nb');
    assert.equal(firstLines(Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n')).split('\n').length, 12);
});

test('a JSON payload wins even on a non-zero exit, because check reports findings that way', async () => {
    const payload = await withResult({ code: 1, stdout: '{"ok":true}', stderr: 'findings' });
    assert.deepEqual(payload, { ok: true });
});

test('a zero exit with no JSON payload is an empty-output error', async () => {
    const payload = await withResult({ code: 0, stdout: '', stderr: '' });
    assert.equal(payload.status, 'error');
    assert.equal(payload.code, 'empty-output');
});

test('an exit 2 without payload becomes a usage error carrying the stderr detail', async () => {
    const payload = await withResult({ code: 2, stdout: '', stderr: "unknown option 'foo'\nrun 'ff help' for usage" });
    assert.equal(payload.code, 'usage');
    assert.match(payload.detail, /unknown option/);
    assert.equal(typeof payload.message, 'string');
});

test('any other non-zero exit becomes a cli-error', async () => {
    const payload = await withResult({ code: 1, stdout: 'the editor refused this file', stderr: '' });
    assert.equal(payload.code, 'cli-error');
    assert.match(payload.detail, /refused this file/);
});

test('a timeout and an abort are their own error values', async () => {
    assert.equal((await withResult({ code: null, stdout: '', stderr: '', timedOut: true })).code, 'timeout');
    assert.equal((await withResult({ code: null, stdout: '', stderr: '', aborted: true })).code, 'cancelled');
});

test('a process that could not start is an infrastructure failure, not an error value', async () => {
    await assert.rejects(
        () => withResult({ code: null, stdout: '', stderr: '', failure: new Error('spawn python ENOENT') }),
        (error) => error instanceof FfCliError && /cannot run python/.test(error.message) && typeof error.guidance === 'string',
    );
});
