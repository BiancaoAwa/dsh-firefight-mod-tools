/**
 * Validation against the real harness schema validator, when it can be imported.
 *
 * `@deepseek-ai/dsh-tools` is a host-provided peer whose own peer tree is not
 * installable from the public mirror, so this test skips itself on a machine
 * where the import fails; `test/output-schema.test.js` and `test/plugin.test.js`
 * cover the same contract against the bundled stand-in there.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { errorValue } from '../lib/render.js';
import { ALL_SPECS, discriminatorOf, outputContract } from '../lib/specs.js';
import { PAYLOADS } from './support.js';

const harness = await import('@deepseek-ai/dsh-tools').catch(() => undefined);
const skip = harness === undefined ? '@deepseek-ai/dsh-tools is not importable here' : false;

/** Define one spec with the real factory, so its output schema is compiled. */
const define = (spec) => harness.defineTool({
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: { schema: outputContract(spec), render: spec.render },
    isConcurrencySafe: () => spec.concurrencySafe === true,
    execute: async () => errorValue('cli-error', 'unused'),
});

test('the real factory accepts every definition', { skip }, () => {
    for (const spec of ALL_SPECS) {
        const tool = define(spec);
        assert.equal(tool.name, spec.name);
    }
});

test('the compiled payload branch keeps its discriminator', { skip }, () => {
    for (const spec of ALL_SPECS) {
        const compiled = define(spec).output.schema;
        assert.deepEqual(compiled.oneOf[0].required, discriminatorOf(spec), `${spec.name}: required survived compilation`);
    }
});

test('the real validator accepts every payload and every error value', { skip }, () => {
    for (const spec of ALL_SPECS) {
        const schema = define(spec).output.schema;
        const payload = harness.validateJsonSchemaValue(schema, PAYLOADS[spec.command], 'value');
        assert.deepEqual(payload, [], `${spec.name} rejected its payload: ${payload.join('; ')}`);
        const error = harness.validateJsonSchemaValue(schema, errorValue('cli-error', 'the CLI failed', 'check the path', 'exit 1'), 'value');
        assert.deepEqual(error, [], `${spec.name} rejected the error value: ${error.join('; ')}`);
    }
});

test('the real validator rejects values that belong to neither branch', { skip }, () => {
    for (const spec of ALL_SPECS) {
        const schema = define(spec).output.schema;
        for (const value of [{}, { status: 'error' }]) {
            const problems = harness.validateJsonSchemaValue(schema, value, 'value');
            assert.ok(problems.length > 0, `${spec.name} accepted ${JSON.stringify(value)}`);
        }
    }
});
