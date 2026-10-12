import assert from 'node:assert/strict';
import test from 'node:test';
import { buildArgs } from '../lib/runner.js';
import { ALL_SPECS, EXPORT_SPEC, EXPORT_TOOL_NAME, READ_SPECS, WRITE_SPECS } from '../lib/specs.js';
import { PAYLOADS } from './support.js';

const MODULE = 'core.cli';

/** Walk a schema spec and collect every object node. */
function objectNodes(node, found = []) {
    if (node === null || typeof node !== 'object')
        return found;
    if (Array.isArray(node)) {
        for (const item of node)
            objectNodes(item, found);
        return found;
    }
    if (node.type === 'object')
        found.push(node);
    for (const value of Object.values(node))
        objectNodes(value, found);
    return found;
}

test('the plugin ships eight read-only specs plus eight writing specs', () => {
    assert.equal(READ_SPECS.length, 8);
    assert.equal(WRITE_SPECS.length, 9);
    assert.equal(ALL_SPECS.length, 17);
    assert.equal(EXPORT_SPEC.name, EXPORT_TOOL_NAME);
    assert.equal(READ_SPECS.some((spec) => WRITE_SPECS.includes(spec)), false);
    assert.equal(new Set(ALL_SPECS.map((spec) => spec.name)).size, 17);
    for (const spec of WRITE_SPECS)
        assert.equal(spec.concurrencySafe, false, `${spec.name} writes, so it is not concurrency safe`);
});

test('every spec is model-facing and builds a complete call', () => {
    for (const spec of ALL_SPECS) {
        assert.match(spec.name, /^ff_[a-z]+$/);
        assert.ok(spec.description.length > 30, `${spec.name} needs a real description`);
        assert.equal(typeof spec.render, 'function');
        assert.equal(typeof spec.concurrencySafe, 'boolean');
        const call = spec.build({ scope: 'Firefight' });
        assert.equal(call.command, spec.command);
        assert.equal(call.scope, 'Firefight');
        for (const [name, parameter] of Object.entries(spec.parameters)) {
            assert.equal(typeof parameter.type, 'string', `${spec.name}.${name} needs a type`);
            assert.ok(parameter.description.length > 0, `${spec.name}.${name} needs a description`);
        }
    }
});

test('scope defaults to Mod and every optional option is dropped when absent', () => {
    assert.deepEqual(buildArgs(MODULE, READ_SPECS[0].build({})), ['-m', MODULE, 'Mod', 'list', '--json']);
    assert.deepEqual(buildArgs(MODULE, ALL_SPECS[6].build({ value: 'WEAPON_PISTOL_P38' })), ['-m', MODULE, 'Mod', 'deps', 'value=WEAPON_PISTOL_P38', '--json']);
});

test('camelCase parameters become the CLI option names', () => {
    const find = ALL_SPECS.find((spec) => spec.name === 'ff_find');
    assert.deepEqual(
        buildArgs(MODULE, find.build({ scope: 'Firefight', selector: 'Weapons', tag: 'flavour', ignoreCase: true, limit: 5 })),
        ['-m', MODULE, 'Firefight', 'find', 'Weapons', 'tag=flavour', 'ignore_case=1', 'limit=5', '--json'],
    );
});

test('the configured roots apply to the right scope', () => {
    const list = ALL_SPECS[0];
    const stock = { firefightRoot: 'D:/ff', workspace: 'D:/mods' };
    assert.equal(list.build({ scope: 'Firefight' }, stock).options.root, 'D:/ff');
    assert.equal(list.build({ scope: 'Mod' }, stock).options.root, undefined);
    assert.equal(list.build({ scope: 'Firefight', root: 'E:/other' }, stock).options.root, 'E:/other');
    assert.equal(list.build({ scope: 'Mod', workspace: 'E:/ws' }, stock).options.workspace, 'E:/ws');
    assert.equal(list.build({ scope: 'Mod' }, undefined).options.workspace, undefined);
});

test('the CLI-required arguments are marked required', () => {
    const required = {
        ff_show: 'selector',
        ff_get: 'selector',
        ff_refs: 'selector',
        ff_deps: 'value',
        ff_export: 'to',
        ff_set: 'field',
        ff_add: 'selector',
        ff_remove: 'selector',
        ff_convert: 'to',
    };
    for (const [name, parameter] of Object.entries(required)) {
        const spec = ALL_SPECS.find((item) => item.name === name);
        assert.equal(spec.parameters[parameter].required, true, `${name}.${parameter}`);
    }
});

test('output schemas stay open on every object node', () => {
    for (const spec of ALL_SPECS) {
        const nodes = objectNodes(spec.output);
        assert.ok(nodes.length > 0, `${spec.name} declares no object node`);
        for (const node of nodes)
            assert.equal(node.additionalProperties, true, `${spec.name} has a closed object node; a new CLI field would fail validation`);
    }
});

test('every spec renders its canned payload', () => {
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
        ff_set: PAYLOADS.set,
        ff_add: PAYLOADS.add,
        ff_remove: PAYLOADS.remove,
        ff_index: PAYLOADS.index,
        ff_convert: PAYLOADS.convert,
        ff_settings: PAYLOADS.settings,
        ff_undo: PAYLOADS.undo,
        ff_redo: PAYLOADS.undo,
    };
    for (const spec of ALL_SPECS) {
        const text = spec.render({}, payloads[spec.name]);
        assert.ok(text.length > 0, `${spec.name} rendered nothing`);
    }
});
