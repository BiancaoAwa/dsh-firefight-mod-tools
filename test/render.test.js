import assert from 'node:assert/strict';
import test from 'node:test';
import { ERROR_SCHEMA, errorValue, isErrorValue, plural, renderCheck, renderDeps, renderExport, renderFind, renderGet, renderList, renderRefs, renderShow, renderStats, renderValue, textBlock, truncate } from '../lib/render.js';
import { PAYLOADS } from './support.js';

test('errorValue keeps the contract and drops empty extras', () => {
    const value = errorValue('usage', 'bad option', 'run ff help', '  ');
    assert.deepEqual(value, { code: 'usage', message: 'bad option', status: 'error', guidance: 'run ff help' });
    assert.equal(isErrorValue(value), true);
    assert.equal(isErrorValue(PAYLOADS.list), false);
});

test('truncate keeps the head and reports how much was dropped', () => {
    assert.equal(truncate('short', 100), 'short');
    const cut = truncate('x'.repeat(50), 10);
    assert.match(cut, /^x{10}\n… 40 more character\(s\) dropped/);
    assert.equal(textBlock('x'.repeat(50), 10)[0].type, 'text');
});

test('plural keeps counts readable', () => {
    assert.equal(plural(1, 'file'), '1 file');
    assert.equal(plural(0, 'file'), '0 files');
});

test('every read renderer prints its headline and rows', () => {
    assert.match(renderList({ selector: 'Weapons' }, PAYLOADS.list), /scope Firefight · 2 entities under "Weapons"/);
    assert.match(renderList({ selector: 'Weapons' }, PAYLOADS.list), /WEAPON_PISTOL_P38\.txt {2}weapon\/txt\/605 B/);
    assert.match(renderShow({}, PAYLOADS.show), /P38/);
    assert.match(renderGet({}, PAYLOADS.get), /weapon\/name:4 = P38/);
    assert.match(renderFind({}, PAYLOADS.find), /find tag=flavour value=FLAVOUR_BALL · 1 match\(es\)/);
    assert.match(renderStats({}, PAYLOADS.stats), /1840 files · 4003531 B · 48 lists/);
    assert.match(renderStats({}, PAYLOADS.stats), /category: weapon 716, vehicle 200/);
    assert.match(renderRefs({}, PAYLOADS.refs), /2 outgoing reference\(s\) \(weapon 2\)/);
    assert.match(renderDeps({}, PAYLOADS.deps), /value WEAPON_PISTOL_P38 · 1 incoming reference\(s\) · resolved Data\/Weapons\/WEAPON_PISTOL_P38\.txt/);
    assert.match(renderDeps({}, { ...PAYLOADS.deps, resolved: [], unresolved: true }), /resolved nothing \(unresolved\)/);
    assert.match(renderCheck({}, PAYLOADS.check), /warnings: 13 in 13 files · dangling: 1/);
    assert.match(renderCheck({}, PAYLOADS.check), /SFX_MISSING/);
    assert.match(renderExport({}, PAYLOADS.export), /export Mod → D:\/out · 1 file/);
});

test('renderShow prefers the converted rendering over the raw text', () => {
    assert.match(renderShow({}, { path: 'a', format: 'txt', text: 'RAW', toml: 'TOML' }), /TOML/);
    assert.match(renderShow({}, { path: 'a', format: 'txt', text: 'RAW' }), /RAW/);
});

test('renderShow renders a subtree as field values', () => {
    const text = renderShow({}, PAYLOADS.showSubtree);
    assert.match(text, /WEAPON_PISTOL_P38\.txt weapon\/ammo · 2 elements · 2 values/);
    assert.match(text, /weapon\/ammo\/type\/name:23 = 9x19mm Parabellum/);
});

test('row caps keep a huge payload readable', () => {
    const entities = Array.from({ length: 250 }, (_, index) => ({ path: `Data/Weapons/W${index}.txt`, category: 'weapon', format: 'txt', bytes: 1 }));
    const text = renderList({}, { scope: 'Firefight', root: 'r', count: 250, entities });
    assert.match(text, /… 150 more/);
    assert.equal(text.split('\n').length, 102);
});

test('renderValue renders the error branch and delegates otherwise', () => {
    const text = renderValue({}, errorValue('timeout', 'no answer', 'raise timeoutMs', 'detail'), renderList, 40000)[0].text;
    assert.equal(text, 'no answer\nraise timeoutMs\ndetail');
    assert.match(renderValue({}, PAYLOADS.list, renderList, 40000)[0].text, /scope Firefight/);
});

test('the error schema stays closed and requires status, code and message', () => {
    assert.equal(ERROR_SCHEMA.additionalProperties, false);
    for (const key of ['status', 'code', 'message'])
        assert.equal(ERROR_SCHEMA.properties[key].required, true);
});
