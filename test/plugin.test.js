/**
 * Harness-level wiring test.
 *
 * `@deepseek-ai/dsh-tools` is a peer the DSH host provides; this repository cannot
 * install its peer tree from the public mirror, so `createTools` takes the tool
 * factory as an argument and these tests inject `test/harness-stub.js` — a
 * contract-faithful stand-in that rejects any option the real definition does not
 * declare. When the real package is resolvable it is used instead, and the note
 * below says which one ran.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as stub from './harness-stub.js';
import { PAYLOADS } from './support.js';

let host;
try {
    host = await import('@deepseek-ai/dsh-tools');
}
catch {
    host = undefined;
}

const defineTool = host?.defineTool ?? stub.defineTool;
/** The real package exposes `validateArgs`, not a value validator, so schemas are always checked with ours. */
const validateValue = stub.validateValue;

const CONFIG = { maxOutputChars: 40000, pythonPath: 'python', timeoutMs: 60000 };
const okRun = (payload) => async () => ({ code: 0, stdout: JSON.stringify(payload), stderr: '', timedOut: false, aborted: false, argv: [] });

test('the harness contract is available', () => {
    assert.equal(typeof defineTool, 'function');
    assert.equal(typeof validateValue, 'function');
});

test('createTools wires the eight read-only tools with valid definitions', async () => {
    const { createTools } = await import('../lib/tools.js');
    const tools = createTools({ config: CONFIG, run: okRun(PAYLOADS.list) }, defineTool);
    assert.equal(tools.length, 8);
    assert.deepEqual(tools.map((tool) => tool.name), ['ff_list', 'ff_show', 'ff_get', 'ff_find', 'ff_stats', 'ff_refs', 'ff_deps', 'ff_check']);
    for (const tool of tools) {
        assert.equal(typeof tool.execute, 'function');
        assert.equal(tool.isConcurrencySafe({}), true);
        assert.ok(tool.description.length > 30);
    }
});

test('ff_export appears only when export is enabled, and it is never concurrent', async () => {
    const { createTools } = await import('../lib/tools.js');
    assert.equal(createTools({ config: CONFIG, run: okRun(PAYLOADS.export) }, defineTool).length, 8);
    const tools = createTools({ config: { ...CONFIG, enableExport: true }, run: okRun(PAYLOADS.export) }, defineTool);
    assert.equal(tools.length, 9);
    assert.equal(tools.find((tool) => tool.name === 'ff_export').isConcurrencySafe({}), false);
});

test('execute runs the CLI and returns its payload, and render projects it', async () => {
    const { createTools } = await import('../lib/tools.js');
    const calls = [];
    const run = async (call) => {
        calls.push(call);
        return { code: 0, stdout: JSON.stringify(PAYLOADS.list), stderr: '', timedOut: false, aborted: false, argv: [] };
    };
    const list = createTools({ config: CONFIG, run }, defineTool).find((tool) => tool.name === 'ff_list');
    const value = await list.execute({ scope: 'Firefight', selector: 'Weapons' }, { signal: undefined });
    assert.deepEqual(value, PAYLOADS.list);
    assert.deepEqual(calls[0], { scope: 'Firefight', command: 'list', selector: 'Weapons', options: { root: undefined, workspace: undefined, type: undefined, limit: undefined } });
    const blocks = list.output.render({}, value);
    assert.equal(blocks[0].type, 'text');
    assert.match(blocks[0].text, /scope Firefight · 2 entities/);
});

test('the published output schemas accept the real payloads and the error value', async () => {
    const { createTools } = await import('../lib/tools.js');
    const { errorValue } = await import('../lib/render.js');
    const payloads = {
        ff_list: PAYLOADS.list,
        ff_show: PAYLOADS.show,
        ff_get: PAYLOADS.get,
        ff_find: PAYLOADS.find,
        ff_stats: PAYLOADS.stats,
        ff_refs: PAYLOADS.refs,
        ff_deps: PAYLOADS.deps,
        ff_check: PAYLOADS.check,
        ff_export: PAYLOADS.export,
    };
    const tools = createTools({ config: { ...CONFIG, enableExport: true }, run: okRun(PAYLOADS.list) }, defineTool);
    for (const tool of tools) {
        assert.deepEqual(validateValue(tool.output.schema, payloads[tool.name]), [], `${tool.name} rejects its own payload`);
        assert.deepEqual(validateValue(tool.output.schema, errorValue('usage', 'bad option', 'run ff help')), [], `${tool.name} rejects an error value`);
    }
});

test('the published output schemas still reject a value of the wrong shape', async () => {
    const { createTools } = await import('../lib/tools.js');
    const list = createTools({ config: CONFIG, run: okRun(PAYLOADS.list) }, defineTool).find((tool) => tool.name === 'ff_list');
    // Both oneOf branches are objects, so a scalar can never be a valid result even
    // though every property is optional and every object node stays open.
    assert.notDeepEqual(validateValue(list.output.schema, 'not a payload'), []);
});

test('apply registers the tools and the approval gate through the context', async () => {
    const { applyWithDeps } = await import('../lib/index.js');
    const registered = [];
    const listeners = [];
    let effects = 0;
    const ctx = {
        effect(fn) {
            effects += 1;
            const dispose = fn();
            return typeof dispose === 'function' ? dispose : () => {};
        },
        tools: { register(tool) { registered.push(tool.name); return () => registered.pop(); } },
        on(event, handler) { listeners.push({ event, handler }); return () => listeners.pop(); },
    };
    applyWithDeps(ctx, { enableExport: true, scriptPath: 'C:/editor/ff.py' }, { run: okRun(PAYLOADS.list), defineTool });
    assert.equal(registered.length, 9);
    assert.equal(effects, 2);
    assert.equal(listeners[0].event, 'tools/pre-execute');
});

test('apply leaves the export tool and the gate out by default', async () => {
    const { applyWithDeps } = await import('../lib/index.js');
    const registered = [];
    let effects = 0;
    const ctx = {
        effect(fn) { effects += 1; return fn() ?? (() => {}); },
        tools: { register(tool) { registered.push(tool.name); return () => registered.pop(); } },
        on() { throw new Error('no approval gate expected'); },
    };
    applyWithDeps(ctx, { scriptPath: 'C:/editor/ff.py' }, { run: okRun(PAYLOADS.list), defineTool });
    assert.equal(registered.length, 8);
    assert.equal(effects, 1);
});
