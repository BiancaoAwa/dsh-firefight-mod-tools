import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConfig } from '../lib/config.js';

test('every configuration key has a default', () => {
    const config = resolveConfig(undefined);
    assert.equal(config.pythonPath, 'python');
    assert.equal(config.cliModule, 'core.cli');
    assert.equal(config.editorRoot, '');
    assert.equal(config.firefightRoot, '');
    assert.equal(config.workspace, '');
    assert.equal(config.cwd, '');
    assert.equal(config.timeoutMs, 60000);
    assert.equal(config.maxOutputChars, 40000);
    assert.equal(config.enableExport, false);
});

test('explicit configuration wins over the defaults and stays complete', () => {
    const config = resolveConfig({ editorRoot: 'C:/editor', enableExport: true, timeoutMs: 1000 });
    assert.equal(config.editorRoot, 'C:/editor');
    assert.equal(config.enableExport, true);
    assert.equal(config.timeoutMs, 1000);
    assert.equal(config.pythonPath, 'python');
});
