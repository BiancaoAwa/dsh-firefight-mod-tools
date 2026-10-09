/**
 * Approval gate for the one writing tool.
 *
 * `ff_export` writes files, so every call stops at the harness approval prompt:
 * the gate returns `ask`, and the harness denies the call outright when no
 * approval channel is available (fail-closed).
 */
import { EXPORT_TOOL_NAME } from './specs.js';

/** Human-readable reason shown by the approval prompt for `ff_export`. */
export function exportApprovalReason(args) {
    const input = args ?? {};
    const scope = typeof input.scope === 'string' && input.scope.length > 0 ? input.scope : 'Mod';
    const selector = typeof input.selector === 'string' && input.selector.length > 0 ? input.selector : 'the whole scope';
    const to = typeof input.to === 'string' && input.to.length > 0 ? ` to ${input.to}` : '';
    return `dsh-firefight-mod-tools: export ${scope} / ${selector}${to}; this writes files`;
}

/** Ask before every `ff_export`; every other tool passes straight through. */
export function registerExportGate(ctx) {
    return ctx.on('tools/pre-execute', async (exec, next) => {
        if (exec?.name !== EXPORT_TOOL_NAME)
            return next();
        return { kind: 'ask', reason: exportApprovalReason(exec.arguments) };
    });
}
