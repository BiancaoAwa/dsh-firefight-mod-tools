/**
 * Plugin configuration: every key has a default, so `config:` in
 * `cordis.patch.yml` may stay empty and the plugin still loads.
 */
import Schema from '@deepseek-ai/schemastery';

export const Config = Schema.object({
    /** Python interpreter that runs the editor CLI. */
    pythonPath: Schema.string().default('python'),
    /** A firefight-mod-editor checkout: the directory that holds `ff.py`. */
    editorRoot: Schema.string().default(''),
    /** Explicit path to `ff.py`; wins over `editorRoot`. */
    scriptPath: Schema.string().default(''),
    /** Stock Firefight installation, passed to the CLI as `root=`. */
    firefightRoot: Schema.string().default(''),
    /** Directory holding `Mods/`, passed to the CLI as `workspace=`. */
    workspace: Schema.string().default(''),
    /** Working directory of the CLI process; empty means the host's own. */
    cwd: Schema.string().default(''),
    /** Kill one CLI call after this many milliseconds. */
    timeoutMs: Schema.number().default(60000),
    /** Hard cap on the text one tool result may carry. */
    maxOutputChars: Schema.number().default(40000),
    /** Register the writing `ff_export` tool; it still asks for approval per call. */
    enableExport: Schema.boolean().default(false),
});

/** Config with every default filled in, even when the host passes nothing. */
export function resolveConfig(rawConfig) {
    try {
        return Config(rawConfig ?? {});
    }
    catch {
        return { ...(rawConfig ?? {}) };
    }
}

export default Config;
