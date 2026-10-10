/**
 * Output-contract regression tests.
 *
 * The harness validates a tool result with `oneOf` by counting matching branches
 * and rejecting a value that matches none or several of them. A payload branch
 * that accepts any object would also match the closed error branch, so every
 * failure would be reported as an invalid tool output instead of the structured
 * error value this plugin returns. These tests keep the two branches disjoint in
 * both directions.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorValue } from '../lib/render.js';
import { ALL_SPECS, discriminatorOf, outputContract } from '../lib/specs.js';
import { validateSpec, validateValue } from './harness-stub.js';
import { PAYLOADS } from './support.js';

const ERROR_KEYS = new Set(['status', 'code', 'message', 'guidance', 'detail']);

test('every output contract is a valid spec with a payload and an error branch', () => {
    for (const spec of ALL_SPECS) {
        const problems = validateSpec(outputContract(spec), `${spec.name}.output.schema`);
        assert.deepEqual(problems, [], `${spec.name}: ${problems.join('; ')}`);
    }
});

test('every payload branch declares exactly one discriminator away from the error keys', () => {
    for (const spec of ALL_SPECS) {
        const keys = discriminatorOf(spec);
        assert.deepEqual(keys.length, 1, `${spec.name} must declare exactly one required property, got ${keys.join(', ') || 'none'}`);
        assert.ok(!ERROR_KEYS.has(keys[0]), `${spec.name} must not use the error key ${keys[0]} as its discriminator`);
    }
});

test('every canned payload matches exactly one branch', () => {
    for (const spec of ALL_SPECS) {
        const payload = PAYLOADS[spec.command];
        const problems = validateValue(outputContract(spec), payload, 'value');
        assert.deepEqual(problems, [], `${spec.name} rejected its own payload: ${problems.join('; ')}`);
    }
});

test('the ff_show subtree payload matches exactly one branch', () => {
    const spec = ALL_SPECS.find((item) => item.command === 'show');
    const problems = validateValue(outputContract(spec), PAYLOADS.showSubtree, 'value');
    assert.deepEqual(problems, [], `ff_show rejected a real subtree payload: ${problems.join('; ')}`);
    assert.deepEqual(validateValue(outputContract(spec), errorValue('usage', 'bad', 'help'), 'value'), []);
});

test('every error value matches exactly one branch', () => {
    for (const spec of ALL_SPECS) {
        const value = errorValue('cli-error', 'the CLI failed', 'check the path', 'exit 1');
        const problems = validateValue(outputContract(spec), value, 'value');
        assert.deepEqual(problems, [], `${spec.name} rejected the error value: ${problems.join('; ')}`);
    }
});

test('values that belong to neither branch are rejected', () => {
    for (const spec of ALL_SPECS) {
        const contract = outputContract(spec);
        for (const value of [{}, { status: 'error' }, { status: 'error', code: 'x' }, { unrelated: true }])
            assert.ok(validateValue(contract, value, 'value').length > 0, `${spec.name} accepted ${JSON.stringify(value)}`);
    }
});

test('a payload without its discriminator is rejected', () => {
    for (const spec of ALL_SPECS) {
        const payload = { ...PAYLOADS[spec.command] };
        for (const key of discriminatorOf(spec))
            delete payload[key];
        assert.ok(validateValue(outputContract(spec), payload, 'value').length > 0, `${spec.name} accepted a payload without its discriminator`);
    }
});
