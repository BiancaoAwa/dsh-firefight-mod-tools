/**
 * Canonical error value, text budgets, and the per-tool text projections.
 *
 * Every renderer is pure: it turns one validated CLI payload into plain text for
 * the model. Rows are capped per renderer and the whole text is capped by
 * `maxOutputChars`, because `ff_list` and `ff_deps` payloads can hold thousands
 * of rows.
 */

const ROW_LIMIT = 100;

/** Error contract shared by all nine tools; it is the second `oneOf` branch of every output. */
export const ERROR_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        status: { type: 'string', required: true, const: 'error' },
        code: { type: 'string', required: true, description: 'Stable machine code: usage, cli-error, timeout, cancelled, empty-output, export-disabled, no-editor.' },
        message: { type: 'string', required: true, description: 'Human-readable failure summary.' },
        guidance: { type: 'string', description: 'What the caller can change to make the call succeed.' },
        detail: { type: 'string', description: 'Trimmed CLI stderr (or stdout) that explains the failure.' },
    },
};

/** Build one canonical error value. */
export function errorValue(code, message, guidance, detail) {
    const value = { code, message, status: 'error' };
    if (guidance !== undefined && guidance.length > 0)
        value.guidance = guidance;
    if (detail !== undefined) {
        const trimmed = detail.trim();
        if (trimmed.length > 0)
            value.detail = trimmed;
    }
    return value;
}

/** Whether one canonical value is an error rather than a CLI payload. */
export function isErrorValue(value) {
    return typeof value === 'object' && value !== null && value.status === 'error';
}

/** One text block, capped at `maxChars`. */
export function textBlock(text, maxChars) {
    return [{ type: 'text', text: truncate(text, maxChars) }];
}

/** Keep the head of an oversized text and say how much was dropped. */
export function truncate(text, maxChars) {
    if (typeof maxChars !== 'number' || maxChars <= 0 || text.length <= maxChars)
        return text;
    const dropped = text.length - maxChars;
    const note = `\n… ${dropped} more character(s) dropped by the plugin's maxOutputChars`;
    return text.slice(0, maxChars) + note;
}

/** `3 files`, `1 file` — keep the counts readable without a pluralisation table. */
export function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** One line of a compact JSON form, used for shapes this plugin does not model. */
function jsonLine(value) {
    if (typeof value === 'string')
        return value;
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}

/** Rows plus a trailing `… N more` line. */
function rows(items, render) {
    const shown = items.slice(0, ROW_LIMIT).map(render);
    if (items.length > shown.length)
        shown.push(`… ${items.length - shown.length} more`);
    return shown;
}

/** The common trailing block for the `errors` array every scoped command returns. */
function errorLines(errors) {
    if (!Array.isArray(errors) || errors.length === 0)
        return [];
    return [`errors: ${errors.length}`, ...rows(errors, (item) => `  ${jsonLine(item)}`)];
}

/** `ff_list` → entities with category, format and size. */
export function renderList(args, value) {
    const entities = value.count === 1 ? '1 entity' : `${value.count} entities`;
    const lines = [`scope ${value.scope} · ${entities}${args.selector === undefined ? '' : ` under "${args.selector}"`}`];
    lines.push(...rows(value.entities ?? [], (item) => `  ${item.path}  ${item.category}/${item.format}/${item.bytes} B`));
    lines.push(...errorLines(value.errors));
    return lines.join('\n');
}

/** `ff_show` → the document as stored (`text`) or converted (`toml`, `xml`), or one subtree. */
export function renderShow(_args, value) {
    if (Array.isArray(value.values)) {
        const lines = [`${value.path} ${value.key ?? ''} · ${plural(value.count ?? 0, 'element')} · ${plural(value.values.length, 'value')}`];
        lines.push(...rows(value.values, (item) => `  ${item.path}:${item.line} = ${jsonLine(item.value)}`));
        lines.push(...errorLines(value.warnings));
        return lines.join('\n');
    }
    const body = value.toml ?? value.xml ?? value.text ?? '';
    const lines = [`${value.path} (${value.format})`, body.trimEnd()];
    lines.push(...errorLines(value.warnings));
    return lines.join('\n');
}

/** `ff_get` → field values with their document path and source line. */
export function renderGet(args, value) {
    const lines = [`${value.path} field "${value.field ?? args.field ?? ''}" · ${value.count} value(s)`];
    lines.push(...rows(value.values ?? [], (item) => `  ${item.path}:${item.line} = ${jsonLine(item.value)}`));
    return lines.join('\n');
}

/** `ff_find` → tag/value/path matches. */
export function renderFind(args, value) {
    const query = value.query ?? {};
    const asked = Object.entries({ tag: query.tag ?? args.tag, value: query.value ?? args.value, path: query.path ?? args.path })
        .filter(([, item]) => typeof item === 'string' && item.length > 0)
        .map(([key, item]) => `${key}=${item}`)
        .join(' ');
    const lines = [`find ${asked} · ${value.count} match(es)${value.truncated ? ' (truncated)' : ''}`];
    lines.push(...rows(value.matches ?? [], (item) => `  ${item.path}:${item.line} ${item.document_path ?? item.tag} = ${jsonLine(item.value)}`));
    return lines.join('\n');
}

/** `ff_stats` → counts by category, format and root element. */
export function renderStats(_args, value) {
    const lines = [`scope ${value.scope} · ${plural(value.files, 'file')} · ${value.bytes} B · ${plural(value.lists, 'list')}`];
    for (const [label, counts] of [['category', value.by_category], ['format', value.by_format], ['root', value.by_root]]) {
        const entries = Object.entries(counts ?? {}).sort((left, right) => right[1] - left[1]);
        if (entries.length > 0)
            lines.push(`  ${label}: ${entries.map(([name, count]) => `${name} ${count}`).join(', ')}`);
    }
    lines.push(...errorLines(value.errors));
    return lines.join('\n');
}

/** `ff_refs` → outgoing references of one document. */
export function renderRefs(_args, value) {
    const kinds = Object.entries(value.by_kind ?? {}).map(([kind, count]) => `${kind} ${count}`).join(', ');
    const lines = [`scope ${value.scope} · ${value.count} outgoing reference(s)${kinds.length > 0 ? ` (${kinds})` : ''}`];
    lines.push(...rows(value.references ?? [], (item) => `  ${item.source}  ${item.kind} = ${item.value}  (${item.document_path})`));
    lines.push(...errorLines(value.errors));
    return lines.join('\n');
}

/** `ff_deps` → incoming references of one token; the payload can hold thousands. */
export function renderDeps(_args, value) {
    const resolved = Array.isArray(value.resolved) ? value.resolved : [];
    const target = value.unresolved === true || resolved.length === 0
        ? 'nothing'
        : resolved.join(', ');
    const lines = [`value ${value.value} · ${value.count} incoming reference(s) · resolved ${target}${value.unresolved === true ? ' (unresolved)' : ''}`];
    lines.push(...rows(value.references ?? [], (item) => `  ${item.source}  ${item.kind}  (${item.document_path})`));
    lines.push(...errorLines(value.errors));
    return lines.join('\n');
}

/** `ff_check` → load report: errors, warnings and dangling references. */
export function renderCheck(_args, value) {
    const lines = [
        `scope ${value.scope} · ${value.ok ? 'ok' : 'failures'} · ${plural(value.files, 'file')}, ${value.loaded} loaded, ${value.skipped} skipped`,
        `warnings: ${value.warnings_total} in ${plural(value.warning_files, 'file')} · dangling: ${Array.isArray(value.dangling) ? value.dangling.length : value.dangling}`,
    ];
    lines.push(...errorLines(value.errors));
    if (Array.isArray(value.warning_samples) && value.warning_samples.length > 0) {
        lines.push(`warning samples:`);
        lines.push(...rows(value.warning_samples, (item) => `  ${jsonLine(item)}`));
    }
    if (Array.isArray(value.dangling) && value.dangling.length > 0) {
        lines.push(`dangling references:`);
        lines.push(...rows(value.dangling, (item) => `  ${jsonLine(item)}`));
    }
    return lines.join('\n');
}

/** `ff_export` → what was written where. */
export function renderExport(_args, value) {
    const lines = [`export ${value.scope} → ${value.to} · ${plural(value.count, 'file')}`];
    lines.push(...rows(value.files ?? [], (item) => `  ${item.path} → ${item.out} (${item.bytes} B)${item.warnings?.length ? ` · ${item.warnings.length} warning(s)` : ''}`));
    lines.push(...errorLines(value.errors));
    return lines.join('\n');
}

/** `ff_set` → the one change, written or only planned. */
export function renderSet(_args, value) {
    const lines = [`set ${value.path} · ${value.field}: ${value.before || '(empty)'} → ${value.after || '(empty)'}`];
    lines.push(`  ${value.bytes_before} B → ${value.bytes_after} B · ${value.encoding} / ${value.newline}`);
    lines.push(...writtenLine(value, 'written'));
    return lines.join('\n');
}

/** `ff_add` and `ff_remove` → the one document that appeared or went away. */
export function renderDocument(_args, value) {
    const verb = value.result === 'remove' ? 'removed' : 'added';
    const lines = [`${verb} ${value.path}${value.entity ? ` · ${value.entity}` : ''}`];
    lines.push(`  ${value.bytes_before} B → ${value.bytes_after} B`);
    lines.push(...writtenLine(value, 'recorded'));
    return lines.join('\n');
}

/** `ff_index` → what the two tables now hold. */
export function renderIndex(_args, value) {
    const lines = [`index ${value.scope} · ${plural(value.documents, 'document')} · ${plural(value.references, 'reference')}`];
    lines.push(...errorLines(value.errors));
    lines.push(...writtenLine(value, 'written'));
    return lines.join('\n');
}

/** `ff_convert` → how much stock data became project working files. */
export function renderConvert(_args, value) {
    const skipped = value.skipped ? `, ${value.skipped} skipped` : '';
    const lines = [`convert ${value.scope} → ${value.data_root} · ${plural(value.written, 'file')}${skipped}`];
    lines.push(...errorLines(value.errors));
    lines.push(...writtenLine(value, 'written'));
    return lines.join('\n');
}

/** `ff_settings` → which of the two settings files was written from which. */
export function renderSettings(_args, value) {
    const skipped = value.skipped ? ' (already there; pass overwrite)' : '';
    const lines = [`settings ${value.op} · ${value.to}${skipped}`];
    lines.push(...writtenLine(value, 'written'));
    return lines.join('\n');
}

/** `ff_undo` and `ff_redo` → the changes put back or replayed. */
export function renderRestore(_args, value) {
    const lines = [`${value.result} ${plural(value.count, 'change')} · ${(value.targets ?? []).join(', ')}`];
    lines.push(...rows(value.documents ?? [], (item) => `  ${item.document} · ${item.field}`));
    lines.push(...writtenLine(value, 'written'));
    return lines.join('\n');
}

/** `ff_init` → the project that was made. */
export function renderInit(_args, value) {
    const lines = [`init ${value.project} · ${value.name} · ${value.data_root}`];
    lines.push(...writtenLine(value, 'recorded'));
    return lines.join('\n');
}

/** `ff_pack` → the archive that was built and what went into it. */
export function renderPack(_args, value) {
    const lines = [`pack ${value.archive} · ${plural(value.count, 'member')} · ${value.archive_bytes} B`];
    lines.push(...rows(value.files ?? [], (item) => `  ${item.name} · ${item.bytes} B`));
    lines.push(...rows(value.skipped ?? [], (item) => `  skipped ${item.path} · ${item.reason}`));
    lines.push(...errorLines(value.errors));
    const state = value.dry_run ? 'not written (dry run)' : 'written';
    lines.push(`  ${state}`);
    return lines.join('\n');
}

/** One line saying whether anything reached the disk. */
function writtenLine(value, recordedKey) {
    if (value.dry_run === true)
        return ['  not written (dry run)'];
    if (value.written === false || value.recorded === false)
        return ['  nothing was written'];
    const extra = value[recordedKey];
    if (Array.isArray(extra))
        return extra.map((item) => `  wrote ${item}`);
    return [];
}

/** Render one canonical value, error branch included. */
export function renderValue(args, value, renderer, maxChars) {
    if (isErrorValue(value)) {
        const lines = [value.message];
        if (value.guidance !== undefined)
            lines.push(value.guidance);
        if (value.detail !== undefined)
            lines.push(value.detail);
        return textBlock(lines.join('\n'), maxChars);
    }
    return textBlock(renderer(args, value), maxChars);
}
