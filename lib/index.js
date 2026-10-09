/**
 * dsh-firefight-mod-tools: reads and writes a Firefight mod project through the
 * firefight-mod-editor CLI.
 *
 * Eight read-only tools are always registered. The one writing tool, `ff_export`,
 * is registered only when `enableExport` is true and then always asks for
 * approval, so a mis-scoped export cannot run unattended.
 */
import { registerExportGate } from './approval.js';
import { Config, resolveConfig } from './config.js';
import { createRunner } from './runner.js';
import { createTools } from './tools.js';

export const name = 'dsh-firefight-mod-tools';
export const inject = ['tools'];
export { Config, resolveConfig };
export { exportApprovalReason, registerExportGate } from './approval.js';

/**
 * @param deps.run - runner override for tests.
 * @param deps.spawn - spawn override for tests.
 * @param deps.defineTool - harness tool factory override for tests.
 */
export function applyWithDeps(ctx, rawConfig, deps = {}) {
    const config = resolveConfig(rawConfig);
    const state = { config, run: deps.run ?? createRunner(config, deps.spawn) };
    ctx.effect(() => {
        const undo = createTools(state, deps.defineTool).map((tool) => ctx.tools.register(tool));
        return () => {
            for (const undoOne of undo.reverse())
                undoOne();
        };
    });
    if (config.enableExport === true)
        ctx.effect(() => registerExportGate(ctx));
}

export function apply(ctx, config) {
    applyWithDeps(ctx, config);
}
