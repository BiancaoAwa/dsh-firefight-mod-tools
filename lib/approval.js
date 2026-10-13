/**
 * Approval gate for the writing tools.
 *
 * Every spec that writes files stops at the harness approval prompt: the gate
 * returns `ask`, and the harness denies the call outright when no approval
 * channel is available (fail-closed). Reading tools pass straight through.
 */
import { TOOL_PREFIX, WRITE_SPECS } from './specs.js';

const WRITE_TOOL_NAMES = new Set(WRITE_SPECS.map((spec) => TOOL_PREFIX + spec.name));

/** `dsh_ff_set` and a bare `ff_set` both read as the `set` command. */
const COMMAND_IN_NAME = new RegExp(`^(?:${TOOL_PREFIX})?ff_`);

/** Human-readable reason shown by the approval prompt for one writing tool. */
export function writeApprovalReason(name, args) {
    const input = args ?? {};
    const scope = typeof input.scope === 'string' && input.scope.length > 0 ? input.scope : 'Mod';
    const selector = typeof input.selector === 'string' && input.selector.length > 0 ? input.selector : 'the whole scope';
    const to = typeof input.to === 'string' && input.to.length > 0 ? ` to ${input.to}` : '';
    const command = typeof name === 'string' ? name.replace(COMMAND_IN_NAME, '') : 'a writing tool';
    return `dsh-firefight-mod-tools: ${command} ${scope} / ${selector}${to}; this writes files`;
}

/** Ask before every writing tool; every other tool passes straight through. */
export function registerWriteGate(ctx) {
    return ctx.on('tools/pre-execute', async (exec, next) => {
        if (!WRITE_TOOL_NAMES.has(exec?.name))
            return next();
        return { kind: 'ask', reason: writeApprovalReason(exec.name, exec.arguments) };
    });
}

/** The name the gate used while `ff_export` was the only writing tool. */
export const exportApprovalReason = (args) => writeApprovalReason(TOOL_PREFIX + 'ff_export', args);
/** The name the gate used while `ff_export` was the only writing tool. */
export const registerExportGate = registerWriteGate;
