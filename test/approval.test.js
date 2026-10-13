import assert from 'node:assert/strict';
import test from 'node:test';
import { exportApprovalReason, registerExportGate } from '../lib/approval.js';
import { EXPORT_TOOL_NAME, TOOL_PREFIX } from '../lib/specs.js';

/** Minimal `tools/pre-execute` host: records the hook and drives it by hand. */
function makeFakeCtx() {
    const listeners = [];
    return {
        listeners,
        on(event, handler) {
            listeners.push({ event, handler });
            return () => listeners.pop();
        },
        async run(exec) {
            assert.equal(listeners.length, 1);
            let passedThrough = false;
            const decision = await listeners[0].handler(exec, () => {
                passedThrough = true;
                return { kind: 'allow', passed: true };
            });
            return { decision, passedThrough };
        },
    };
}

test('the approval reason names the scope, the selection and the destination', () => {
    assert.equal(exportApprovalReason({ scope: 'Mod', selector: 'Weapons', to: 'D:/out' }), 'dsh-firefight-mod-tools: export Mod / Weapons to D:/out; this writes files');
    assert.equal(exportApprovalReason({}), 'dsh-firefight-mod-tools: export Mod / the whole scope; this writes files');
});

test('ff_export is always asked about, never allowed silently', async () => {
    const ctx = makeFakeCtx();
    ctx.effect = () => registerExportGate(ctx);
    ctx.effect();
    const { decision, passedThrough } = await ctx.run({ name: TOOL_PREFIX + EXPORT_TOOL_NAME, arguments: { scope: 'Firefight', to: 'D:/out' } });
    assert.equal(decision.kind, 'ask');
    assert.match(decision.reason, /export Firefight \/ the whole scope to D:\/out/);
    assert.equal(passedThrough, false);
});

test('every other tool passes straight through the gate', async () => {
    const ctx = makeFakeCtx();
    ctx.effect = () => registerExportGate(ctx);
    ctx.effect();
    const { decision, passedThrough } = await ctx.run({ name: `${TOOL_PREFIX}ff_list`, arguments: {} });
    assert.equal(passedThrough, true);
    assert.deepEqual(decision, { kind: 'allow', passed: true });
});
