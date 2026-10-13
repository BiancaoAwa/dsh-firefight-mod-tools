/**
 * Harness-level wiring test.
 *
 * `@deepseek-ai/dsh-tools` is a peer the DSH host provides; this repository cannot
 * install its peer tree from the public mirror, so `createTools` takes the tool
 * factory as an argument and these tests inject `test/harness-stub.js` — a
 * contract-faithful stand-in that rejects any option the real definition does not
 * declare. When the real package is resolvable it is used instead, and the real
 * validator checks the compiled schema on top.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as stub from './harness-stub.js';
import { ALL_SPECS, TOOL_PREFIX, outputContract } from '../lib/specs.js';
import { PAYLOADS } from './support.js';

let host;
try {
    host = await import('@deepseek-ai/dsh-tools');
}
catch {
    host = undefined;
}

const defineTool = host?.defineTool ?? stub.defineTool;
/**
 * The real factory compiles the author specs into raw JSON Schema (`required`
 * becomes an array), which the stand-in does not read; so values are always
 * checked against the plugin's own author specs, and the real
 * `validateJsonSchemaValue` checks the compiled schema as well when it is around.
 */
const validateValue = stub.validateValue;
const specOf = (name) => ALL_SPECS.find((spec) => spec.name === name.replace(TOOL_PREFIX, ''));
const payloadOf = (tool) => PAYLOADS[tool.name.slice(TOOL_PREFIX.length).replace(/^ff_/, '')];
/** Arguments that satisfy every required parameter of a tool, for the real wrapper. */
const ARGS = {
    [`${TOOL_PREFIX}ff_list`]: {}, [`${TOOL_PREFIX}ff_stats`]: {}, [`${TOOL_PREFIX}ff_find`]: {}, [`${TOOL_PREFIX}ff_check`]: {},
    [`${TOOL_PREFIX}ff_show`]: { selector: 'Data/Weapons/WEAPON_PISTOL_P38.txt' },
    [`${TOOL_PREFIX}ff_get`]: { selector: 'Data/Weapons/WEAPON_PISTOL_P38.txt', field: 'name' },
    [`${TOOL_PREFIX}ff_refs`]: { selector: 'Data/Weapons/WEAPON_PISTOL_P38.txt' },
    [`${TOOL_PREFIX}ff_deps`]: { value: 'WEAPON_PISTOL_P38' },
    [`${TOOL_PREFIX}ff_export`]: { to: '/tmp/out' },
};

/** The registered names of the reading tools, in the order the table declares them. */
const READ_NAMES = ['ff_list', 'ff_show', 'ff_get', 'ff_find', 'ff_stats', 'ff_refs', 'ff_deps', 'ff_check'].map((name) => TOOL_PREFIX + name);

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
    assert.deepEqual(tools.map((tool) => tool.name), READ_NAMES);
    for (const tool of tools) {
        assert.equal(typeof tool.execute, 'function');
        // The real factory validates the arguments before it answers, so pass a
        // call that could actually be made instead of an empty object.
        assert.equal(tool.isConcurrencySafe(ARGS[tool.name]), true);
        assert.ok(tool.description.length > 30);
    }
});

test('ff_export appears only when export is enabled, and it is never concurrent', async () => {
    const { createTools } = await import('../lib/tools.js');
    assert.equal(createTools({ config: CONFIG, run: okRun(PAYLOADS.export) }, defineTool).length, 8);
    const tools = createTools({ config: { ...CONFIG, enableExport: true }, run: okRun(PAYLOADS.export) }, defineTool);
    assert.equal(tools.length, 9);
    assert.equal(tools.find((tool) => tool.name === `${TOOL_PREFIX}ff_export`).isConcurrencySafe(ARGS[`${TOOL_PREFIX}ff_export`]), false);
});

test('execute runs the CLI and returns its payload, and render projects it', async () => {
    const { createTools } = await import('../lib/tools.js');
    const calls = [];
    const run = async (call) => {
        calls.push(call);
        return { code: 0, stdout: JSON.stringify(PAYLOADS.list), stderr: '', timedOut: false, aborted: false, argv: [] };
    };
    const list = createTools({ config: CONFIG, run }, defineTool).find((tool) => tool.name === `${TOOL_PREFIX}ff_list`);
    const value = await list.execute({ scope: 'Firefight', selector: 'Weapons' }, { signal: undefined });
    assert.deepEqual(value, PAYLOADS.list);
    assert.deepEqual(calls[0], { scope: 'Firefight', command: 'list', selector: 'Weapons', options: { root: undefined, workspace: undefined, type: undefined } });
    const blocks = list.output.render({}, value);
    assert.equal(blocks[0].type, 'text');
    assert.match(blocks[0].text, /scope Firefight · 2 entities/);
});

test('the published output schemas accept the real payloads and the error value', async () => {
    const { createTools } = await import('../lib/tools.js');
    const { errorValue } = await import('../lib/render.js');
    const tools = createTools({ config: { ...CONFIG, enableExport: true }, run: okRun(PAYLOADS.list) }, defineTool);
    const realValidator = typeof host?.validateJsonSchemaValue === 'function' ? host.validateJsonSchemaValue : undefined;
    for (const tool of tools) {
        const contract = outputContract(specOf(tool.name));
        const payload = payloadOf(tool);
        const failure = errorValue('usage', 'bad option', 'run ff help');
        assert.deepEqual(validateValue(contract, payload), [], `${tool.name} rejects its own payload`);
        assert.deepEqual(validateValue(contract, failure), [], `${tool.name} rejects an error value`);
        if (realValidator !== undefined) {
            assert.deepEqual(realValidator(tool.output.schema, payload, 'value'), [], `${tool.name} compiled schema rejects its payload`);
            assert.deepEqual(realValidator(tool.output.schema, failure, 'value'), [], `${tool.name} compiled schema rejects an error value`);
        }
    }
});

test('the published output schemas still reject a value of the wrong shape', async () => {
    const { createTools } = await import('../lib/tools.js');
    const list = createTools({ config: CONFIG, run: okRun(PAYLOADS.list) }, defineTool).find((tool) => tool.name === `${TOOL_PREFIX}ff_list`);
    const contract = outputContract(specOf(list.name));
    // Both oneOf branches are objects, so a scalar can never be a valid result, and
    // an object without the payload branch's discriminator belongs to no branch.
    assert.notDeepEqual(validateValue(contract, 'not a payload'), []);
    assert.notDeepEqual(validateValue(contract, {}), []);
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
    applyWithDeps(ctx, { enableExport: true, editorRoot: 'C:/editor' }, { run: okRun(PAYLOADS.list), defineTool });
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
    applyWithDeps(ctx, { editorRoot: 'C:/editor' }, { run: okRun(PAYLOADS.list), defineTool });
    assert.equal(registered.length, 8);
    assert.equal(effects, 1);
});

test('apply gates the writing tools when enableWrites is on without enableExport', async () => {
    const { applyWithDeps } = await import('../lib/index.js');
    const registered = [];
    const listeners = [];
    let effects = 0;
    const ctx = {
        effect(fn) { effects += 1; return fn() ?? (() => {}); },
        tools: { register(tool) { registered.push(tool.name); return () => registered.pop(); } },
        on(event, handler) { listeners.push({ event, handler }); return () => listeners.pop(); },
    };
    applyWithDeps(ctx, { enableWrites: true, editorRoot: 'C:/editor' }, { run: okRun(PAYLOADS.list), defineTool });
    assert.equal(registered.length, 17);
    assert.equal(effects, 2, 'the gate must be registered alongside the writing tools');
    assert.equal(listeners[0].event, 'tools/pre-execute');
});
