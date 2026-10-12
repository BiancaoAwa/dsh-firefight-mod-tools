/**
 * One spec per CLI command: model-facing description, parameter schema, call
 * builder and canonical output schema.
 *
 * Specs are plain data so they can be unit tested without the harness, and
 * `lib/tools.js` is the only place that turns them into registered tools.
 *
 * Output schemas stay OPEN (`additionalProperties: true`) on purpose: a newer
 * editor CLI that adds a field must not turn a valid payload into a failed
 * output validation. The error branch is closed, because this plugin owns it.
 *
 * Every payload branch marks one property `required` (`req`). The harness
 * validates an output against `oneOf` by counting branches, and it rejects a
 * value that matches more than one branch: an open object with no required
 * property would also match the closed error branch, so every failure would be
 * rejected as an invalid output. The required property is never present in an
 * error value (`status`, `code`, `message`, `guidance`, `detail`), and a payload
 * never carries `status: "error"`, so exactly one branch matches either way.
 */
import { ERROR_SCHEMA, renderCheck, renderConvert, renderDeps, renderDocument, renderExport, renderFind, renderGet, renderIndex, renderList, renderRefs, renderRestore, renderSet, renderSettings, renderShow, renderStats } from './render.js';

/** Name of the writing tool; the plugin registers it only when export is enabled. */
export const EXPORT_TOOL_NAME = 'ff_export';

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'integer', description });
const flag = (description) => ({ type: 'boolean', description });
const json = (description) => ({ type: 'json', description });
const dict = (description) => ({ type: 'object', additionalProperties: true, description });
const arr = (items, description) => ({ type: 'array', items, description });
const obj = (properties, description) => ({ type: 'object', additionalProperties: true, properties, description });
/** Marks the one property that keeps a payload branch disjoint from the error branch. */
const req = (spec) => ({ ...spec, required: true });

const SCOPE = str('Data scope: "Firefight" (stock game data), "Mod" (the mod project of the working directory) or another mod folder name. Defaults to "Mod".');
const ROOT = str('Scope root override, passed to the CLI as root=<directory>. Defaults to the plugin config: firefightRoot for Firefight, otherwise the editor CLI resolves it.');
const WORKSPACE = str('Directory that holds Mods/, passed as workspace=<directory>. Defaults to the plugin config or the CLI working directory.');
const LIMIT = num('Row cap for the CLI text output (default 200; 0 prints every row).');
const KIND = str('Reference kind filter, for example weapon or sound.');
const DRY_RUN = flag('Report what would happen without writing anything, not even .editor/.');
const OVERWRITE = flag('Replace a file that is already there. The default belongs to the command: export replaces, convert and settings keep what is there.');

const ERROR_LIST = arr(json('One CLI-side diagnostic; usually a message string.'), 'Diagnostics the CLI collected while scanning, if any.');

const ENTITY = obj({
    path: str('Entity path relative to the scope root.'),
    category: str('Editor category, for example weapon.'),
    format: str('On-disk format, for example txt or xml.'),
    bytes: num('File size in bytes.'),
}, 'One entity of the scope.');

const REFERENCE = obj({
    source: str('Document that holds the reference.'),
    kind: str('Reference kind, for example weapon or sound.'),
    value: str('Referenced token.'),
    document_path: str('Path of the element inside its document.'),
}, 'One reference edge.');

const INCOMING = obj({
    source: str('Document that references the token.'),
    kind: str('Reference kind, for example weapon.'),
    document_path: str('Path of the element inside its document.'),
}, 'One incoming reference edge.');

const LIST_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    root: str('Resolved scope root.'),
    count: num('Number of entities listed.'),
    entities: arr(ENTITY, 'Entities of the selection.'),
}, 'Entity listing.');

const FIELD_VALUE = obj({
    path: str('Document path of the element that holds the value.'),
    line: num('One-based line in the source file.'),
    value: json('The value itself.'),
}, 'One field value.');

const SHOW_OUTPUT = obj({
    path: req(str('Document path.')),
    format: str('On-disk format; absent when the selector named a subtree.'),
    text: str('Document as stored; present when the CLI renders raw.'),
    toml: str('Document as TOML; present for as=toml.'),
    xml: str('Document as normalized XML; present for as=xml.'),
    key: str('Document path that was rendered, present when the selector named a subtree.'),
    count: num('Number of elements the subtree selector matched, present with the subtree form.'),
    values: arr(FIELD_VALUE, 'Values of the subtree, present with the subtree form.'),
    warnings: arr(json('One conversion warning string.'), 'Conversion warnings, if any.'),
}, 'One rendered document or subtree.');

const GET_OUTPUT = obj({
    path: req(str('Document path.')),
    field: str('Field that was queried.'),
    count: num('Number of values found.'),
    values: arr(FIELD_VALUE, 'Values in document order.'),
}, 'Field values of one document.');

const FIND_OUTPUT = obj({
    query: obj({
        tag: json('Tag name filter, if given.'),
        value: json('Value text filter, if given.'),
        path: json('Document path prefix filter, if given.'),
        ignore_case: flag('Whether the search ignored case.'),
    }, 'The query the CLI ran.'),
    count: req(num('Number of matches returned.')),
    truncated: flag('True when the CLI stopped at the limit.'),
    matches: arr(obj({
        path: str('Document that matched.'),
        line: num('One-based line in the source file.'),
        tag: str('Tag that matched.'),
        document_path: str('Path of the element inside its document.'),
        value: json('Value of the matched tag.'),
    }, 'One match.'), 'Matches in document order.'),
}, 'Search result.');

const STATS_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    root: str('Resolved scope root.'),
    files: num('Number of files scanned.'),
    bytes: num('Total size in bytes.'),
    lists: num('Number of list files.'),
    by_category: dict('File count per editor category.'),
    by_format: dict('File count per on-disk format.'),
    by_root: dict('File count per root element.'),
    errors: ERROR_LIST,
}, 'Scope statistics.');

const REFS_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    count: num('Number of outgoing references.'),
    by_kind: dict('Reference count per kind.'),
    references: arr(REFERENCE, 'Outgoing references.'),
    errors: ERROR_LIST,
}, 'Outgoing references of one selection.');

const DEPS_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    value: str('Token that was queried.'),
    count: num('Number of incoming references.'),
    references: arr(INCOMING, 'Incoming references. This array is not limited by limit=.'),
    resolved: arr(str('Path of an entity the token resolved to.'), 'Entities the token resolved to; empty when it resolves to nothing.'),
    unresolved: flag('True when the token resolves to no entity.'),
    errors: ERROR_LIST,
}, 'Incoming references of one token.');

const CHECK_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    files: num('Number of files considered.'),
    loaded: num('Number of files loaded successfully.'),
    skipped: num('Number of files skipped.'),
    errors: ERROR_LIST,
    warnings_total: num('Total number of warnings.'),
    warning_files: num('Number of files with warnings.'),
    warning_samples: arr(json('One warning sample.'), 'Sample warnings.'),
    dangling: arr(json('One dangling reference.'), 'References that point at nothing.'),
    ok: flag('True when the selection loaded without errors.'),
}, 'Load report.');

const EXPORT_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    to: str('Destination directory, resolved by the CLI.'),
    count: num('Number of files written.'),
    files: arr(obj({
        path: str('Entity path inside the scope.'),
        out: str('Absolute path that was written.'),
        bytes: num('Bytes written.'),
        warnings: arr(json('One conversion warning.'), 'Warnings for this file.'),
    }, 'One written file.'), 'Written files.'),
    errors: ERROR_LIST,
}, 'Export result.');

const SET_OUTPUT = obj({
    path: req(str('Document path inside the project.')),
    entity: str('Name of the entity the document describes.'),
    field: str('Field path that was addressed.'),
    before: str('Value before the change.'),
    after: str('Value after the change.'),
    encoding: str('Encoding the document is written in.'),
    newline: str('Line ending the document is written with.'),
    bom: flag('Whether the document starts with a byte order mark.'),
    bytes_before: num('Size before the change.'),
    bytes_after: num('Size after the change.'),
    digest_before: str('Hash of the bytes before the change.'),
    digest_after: str('Hash of the bytes after the change.'),
    enum: json('Enum lookup for the field, when the editor keeps one.'),
    dry_run: flag('True when nothing was written.'),
    written: flag('True when the document reached the disk.'),
    event: str('Identifier of the recorded event.'),
}, 'One field change.');

const DOCUMENT_OUTPUT = obj({
    path: str('Document path inside the project.'),
    entity: str('Name of the entity the document describes.'),
    result: req(str('add or remove.')),
    existed_before: flag('Whether the document was already there.'),
    bytes_before: num('Size before the change.'),
    bytes_after: num('Size after the change.'),
    digest_before: str('Hash of the bytes before the change.'),
    digest_after: str('Hash of the bytes after the change.'),
    dry_run: flag('True when nothing was written.'),
    recorded: flag('True when the change reached the log.'),
    scope: str('Resolved scope name.'),
    root: str('Root tag of the document, for add.'),
}, 'One created or deleted document.');

const INDEX_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    root: str('Project directory that was indexed.'),
    documents: num('Documents the index covers.'),
    references: num('Outgoing references it holds.'),
    sources: num('Documents that contribute a reference.'),
    skipped: num('Documents that were skipped.'),
    errors: ERROR_LIST,
    dry_run: flag('True when nothing was written.'),
    written: arr(str('Path of one table that was written.'), 'Tables that were written.'),
    fingerprint: str('Hash of the index contents.'),
}, 'Index result.');

const RESTORE_OUTPUT = obj({
    result: req(str('undo or redo.')),
    count: num('Changes that were put back or replayed.'),
    targets: arr(str('Identifier of one reverted record.'), 'Records this call points at.'),
    events: arr(str('Identifier of one new record.'), 'Records this call appended.'),
    dry_run: flag('True when nothing was written.'),
    documents: arr(obj({
        document: str('Document path inside the project.'),
        entity: str('Name of the entity the document describes.'),
        field: str('Field the change touched.'),
        before: str('Value before the change.'),
        after: str('Value after the change.'),
        bytes_before: num('Size before the change.'),
        bytes_after: num('Size after the change.'),
        event: str('Identifier of the record.'),
    }, 'One document a restore touches.'), 'Documents the restore touches.'),
}, 'Undo or redo result.');

const CONVERT_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    to: str('Destination directory, resolved by the CLI.'),
    data_root: str('Directory the working files go into.'),
    count: num('Entity files the scope holds.'),
    written: num('Working files that were written.'),
    skipped: num('Files that were skipped.'),
    errors: ERROR_LIST,
    files: arr(obj({
        path: str('Entity path inside the scope.'),
        out: str('Path the working file was written to.'),
        bytes: num('Bytes written.'),
    }, 'One converted file.'), 'Converted files.'),
    dry_run: flag('True when nothing was written.'),
}, 'Convert result.');

const SETTINGS_OUTPUT = obj({
    scope: req(str('Resolved scope name.')),
    op: str('Direction that ran: render or emit.'),
    from: str('File the direction read.'),
    to: str('File the direction wrote.'),
    skipped: flag('True when the target was already there and overwrite was not set.'),
    bytes_before: num('Size of the target before the write.'),
    bytes_after: num('Size of the target after the write.'),
    dry_run: flag('True when nothing was written.'),
}, 'Settings translation result.');

/** Default scope of every tool: the mod the caller is working on. */
function scopeOf(args) {
    return typeof args.scope === 'string' && args.scope.length > 0 ? args.scope : 'Mod';
}

/**
 * `root=` is the scope root, so the configured stock directory only applies to the
 * `Firefight` scope; for `Mod` the CLI resolves the root from its working directory.
 */
function rootOption(args, config) {
    if (typeof args.root === 'string' && args.root.length > 0)
        return args.root;
    if (scopeOf(args) === 'Firefight' && typeof config?.firefightRoot === 'string' && config.firefightRoot.length > 0)
        return config.firefightRoot;
    return undefined;
}

/** Options shared by every command; empty values are dropped by the runner. */
function baseOptions(args, config) {
    return {
        root: rootOption(args, config),
        workspace: typeof args.workspace === 'string' && args.workspace.length > 0 ? args.workspace : config?.workspace,
    };
}

/** The eight read-only tools, in the order they are registered. */
export const READ_SPECS = [
    {
        name: 'ff_list',
        command: 'list',
        description: 'List the entities of a Firefight data scope with their category, on-disk format and size. Use it to find entity paths before ff_show, ff_get, ff_check or ff_export.',
        parameters: {
            scope: SCOPE,
            selector: str('Optional folder or path prefix, for example Weapons or Data/Weapons. A selector that contains "=" is read by the CLI as key=value and silently widens the listing; rename such a folder.'),
            type: str('Optional editor category filter, passed as type=<category>, for example weapon.'),
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: LIST_OUTPUT,
        render: renderList,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'list', selector: args.selector, options: { ...baseOptions(args, config), type: args.type } }),
    },
    {
        name: 'ff_show',
        command: 'show',
        description: 'Show one Firefight entity as stored, or converted to TOML/XML. Warnings list every conversion the editor had to guess.',
        parameters: {
            scope: SCOPE,
            selector: { ...str('Entity path, for example Data/Weapons/WEAPON_PISTOL_P38.txt, a category name, or a document path inside the file, for example Data/Weapons/WEAPON_PISTOL_P38.txt/ammo for a subtree.'), required: true },
            as: { type: 'string', enum: ['raw', 'toml', 'xml'], description: 'Rendering: raw is the file as stored, toml and xml are conversions. Defaults to raw.' },
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: SHOW_OUTPUT,
        render: renderShow,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'show', selector: args.selector, options: { ...baseOptions(args, config), as: args.as } }),
    },
    {
        name: 'ff_get',
        command: 'get',
        description: 'Read the values of one field from a Firefight document, with the document path and source line of each value.',
        parameters: {
            scope: SCOPE,
            selector: { ...str('Entity path, for example Data/Weapons/WEAPON_PISTOL_P38.txt; it may already end in the field path.'), required: true },
            field: str('Dot-separated field path relative to the document root element, for example name or ammo.type.'),
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: GET_OUTPUT,
        render: renderGet,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'get', selector: args.selector, options: { ...baseOptions(args, config), field: args.field } }),
    },
    {
        name: 'ff_find',
        command: 'find',
        description: 'Search the scope for a tag name, a value text or a document path prefix. Use it to locate where a token or tag is used.',
        parameters: {
            scope: SCOPE,
            selector: str('Optional folder or entity to search inside.'),
            tag: str('Tag name to match, for example flavour.'),
            value: str('Value text to match, for example FLAVOUR_BALL.'),
            path: str('Document path prefix to match, for example weapon/ammo.'),
            ignoreCase: flag('Match value text case-insensitively.'),
            limit: LIMIT,
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: FIND_OUTPUT,
        render: renderFind,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'find', selector: args.selector, options: { ...baseOptions(args, config), tag: args.tag, value: args.value, path: args.path, ignore_case: args.ignoreCase, limit: args.limit } }),
    },
    {
        name: 'ff_stats',
        command: 'stats',
        description: 'Count the files of a Firefight data scope by category, on-disk format and root element. Use it for an overview before a deep read.',
        parameters: {
            scope: SCOPE,
            selector: str('Optional folder or entity to measure instead of the whole scope.'),
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: STATS_OUTPUT,
        render: renderStats,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'stats', selector: args.selector, options: baseOptions(args, config) }),
    },
    {
        name: 'ff_refs',
        command: 'refs',
        description: 'List the outgoing references of one entity or folder: which tokens it points at, with the document path of each reference.',
        parameters: {
            scope: SCOPE,
            selector: { ...str('Entity path or folder, for example Data/Weapons/WEAPON_PISTOL_P38.txt.'), required: true },
            kind: KIND,
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: REFS_OUTPUT,
        render: renderRefs,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'refs', selector: args.selector, options: { ...baseOptions(args, config), kind: args.kind } }),
    },
    {
        name: 'ff_deps',
        command: 'deps',
        description: 'List the incoming references of one token: every document that points at it. Use it before renaming or deleting an entity.',
        parameters: {
            scope: SCOPE,
            value: { ...str('The token to look up, for example WEAPON_PISTOL_P38.'), required: true },
            kind: KIND,
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: DEPS_OUTPUT,
        render: renderDeps,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'deps', selector: undefined, options: { ...baseOptions(args, config), value: args.value, kind: args.kind } }),
    },
    {
        name: 'ff_check',
        command: 'check',
        description: 'Load a scope (or one entity or folder) and report load errors, conversion warnings and dangling references. A non-empty report is a result, not a tool failure.',
        parameters: {
            scope: SCOPE,
            selector: str('Optional entity or folder to check instead of the whole scope.'),
            root: ROOT,
            workspace: WORKSPACE,
        },
        output: CHECK_OUTPUT,
        render: renderCheck,
        concurrencySafe: true,
        build: (args, config) => ({ scope: scopeOf(args), command: 'check', selector: args.selector, options: baseOptions(args, config) }),
    },
];

/** `ff_export`: stock XML under a destination directory. */
export const EXPORT_SPEC = {
    name: EXPORT_TOOL_NAME,
    command: 'export',
    description: 'Render the entities of a Firefight scope as stock XML under a destination directory. This WRITES files; narrow it with selector and check the result.',
    parameters: {
        scope: SCOPE,
        selector: str('Optional entity or folder to export instead of the whole scope.'),
        to: { ...str('Destination directory, passed as to=<directory>. The CLI resolves relative paths against its working directory.'), required: true },
        overwrite: OVERWRITE,
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: EXPORT_OUTPUT,
    render: renderExport,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'export', selector: args.selector, options: { ...baseOptions(args, config), to: args.to, overwrite: args.overwrite, 'dry-run': args.dryRun } }),
};

/** `ff_set`: one field of one project document, or one entry of an array of tables. */
export const SET_SPEC = {
    name: 'ff_set',
    command: 'set',
    description: 'Change one field of one project document, or add and remove one entry of an array of tables. This WRITES; a document that changed on disk is refused rather than overwritten.',
    parameters: {
        scope: SCOPE,
        selector: { ...str('Entity path of the document to change, for example Data/Weapons/WEAPON_PISTOL_P38.txt.'), required: true },
        field: { ...str('Dot-separated field path relative to the document root element, for example description.quality; an array entry is named by its index, for example ammo.type.0.'), required: true },
        value: str('Value to write, spelled the way the document spells it. Omit it when op is append or delete.'),
        op: { type: 'string', enum: ['append', 'delete'], description: 'append adds one entry to the array of tables field names, delete removes the entry the index in field names. Without it the value replaces the field.' },
        from: num('append only: copy the entry at this index instead of writing an empty one.'),
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: SET_OUTPUT,
    render: renderSet,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'set', selector: args.selector, options: { ...baseOptions(args, config), field: args.field, value: args.value, op: args.op, from: args.from, 'dry-run': args.dryRun } }),
};

/** `ff_add`: one new project document. */
export const ADD_SPEC = {
    name: 'ff_add',
    command: 'add',
    description: 'Create one project document, either empty for its root element or as the entry the index names. This WRITES; an existing document is refused.',
    parameters: {
        scope: SCOPE,
        selector: { ...str('Path of the document to create, for example Data/Weapons/WEAPON_DEMO.toml.'), required: true },
        type: str('Root tag of the new document, for example weapon. Defaults to the fixture a known stock path implies.'),
        from: num('Copy the entry at this index of the array of tables instead of writing an empty one.'),
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: DOCUMENT_OUTPUT,
    render: renderDocument,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'add', selector: args.selector, options: { ...baseOptions(args, config), type: args.type, from: args.from, 'dry-run': args.dryRun } }),
};

/** `ff_remove`: delete one project document, keeping its bytes for undo. */
export const REMOVE_SPEC = {
    name: 'ff_remove',
    command: 'remove',
    description: 'Delete one project document and record its bytes so undo can put it back. This WRITES; a missing document is refused.',
    parameters: {
        scope: SCOPE,
        selector: { ...str('Path of the document to delete, for example Data/Weapons/WEAPON_DEMO.toml.'), required: true },
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: DOCUMENT_OUTPUT,
    render: renderDocument,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'remove', selector: args.selector, options: { ...baseOptions(args, config), 'dry-run': args.dryRun } }),
};

/** `ff_index`: the cross-reference tables of a project. */
export const INDEX_SPEC = {
    name: 'ff_index',
    command: 'index',
    description: 'Build the cross-reference tables of a project, .editor/index.toml and .editor/refs.toml, and report what check would find. This WRITES; without it ff_refs and ff_deps answer from a graph built on each run.',
    parameters: {
        scope: SCOPE,
        selector: str('Optional entity or folder to index instead of the whole project.'),
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: INDEX_OUTPUT,
    render: renderIndex,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'index', selector: args.selector, options: { ...baseOptions(args, config), 'dry-run': args.dryRun } }),
};

/** `ff_convert`: stock files into project working files. */
export const CONVERT_SPEC = {
    name: 'ff_convert',
    command: 'convert',
    description: 'Turn the stock files of a scope into project working files under to=, one .toml per entity. This WRITES; a working file that is already there is skipped unless overwrite is true.',
    parameters: {
        scope: SCOPE,
        selector: str('Optional entity or folder to convert instead of the whole scope.'),
        to: { ...str('Destination project directory, passed as to=<directory>; the editor appends Mod/.'), required: true },
        overwrite: OVERWRITE,
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: CONVERT_OUTPUT,
    render: renderConvert,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'convert', selector: args.selector, options: { ...baseOptions(args, config), to: args.to, overwrite: args.overwrite, 'dry-run': args.dryRun } }),
};

/** `ff_settings`: the stock settings file and the project file, either direction. */
export const SETTINGS_SPEC = {
    name: 'ff_settings',
    command: 'settings',
    description: 'Translate between the stock Mod/mod.txt of a project and its mod_setting.toml. op=render reads the stock file and writes the project file, op=emit writes the stock file back. This WRITES; a target that is already there is skipped unless overwrite is true.',
    parameters: {
        scope: SCOPE,
        op: { type: 'string', enum: ['render', 'emit'], description: 'render (default) for stock mod.txt to mod_setting.toml, emit for the other direction.' },
        overwrite: OVERWRITE,
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: SETTINGS_OUTPUT,
    render: renderSettings,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'settings', options: { ...baseOptions(args, config), op: args.op, overwrite: args.overwrite, 'dry-run': args.dryRun } }),
};

/** `ff_undo`: put back what the newest writes replaced. */
export const UNDO_SPEC = {
    name: 'ff_undo',
    command: 'undo',
    description: 'Put back what the last writes of a project replaced, newest change first. This WRITES; an undo past the log is refused.',
    parameters: {
        scope: SCOPE,
        count: num('How many applied changes to revert; defaults to 1.'),
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: RESTORE_OUTPUT,
    render: renderRestore,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'undo', selector: args.count, options: { ...baseOptions(args, config), 'dry-run': args.dryRun } }),
};

/** `ff_redo`: replay what the newest undos put back. */
export const REDO_SPEC = {
    name: 'ff_redo',
    command: 'redo',
    description: 'Replay the changes the last undos put back, oldest first. This WRITES; a redo past the log is refused.',
    parameters: {
        scope: SCOPE,
        count: num('How many undone changes to replay; defaults to 1.'),
        dryRun: DRY_RUN,
        root: ROOT,
        workspace: WORKSPACE,
    },
    output: RESTORE_OUTPUT,
    render: renderRestore,
    concurrencySafe: false,
    build: (args, config) => ({ scope: scopeOf(args), command: 'redo', selector: args.count, options: { ...baseOptions(args, config), 'dry-run': args.dryRun } }),
};

/** Every spec that writes files; registered together behind one config gate. */
export const WRITE_SPECS = [EXPORT_SPEC, SET_SPEC, ADD_SPEC, REMOVE_SPEC, INDEX_SPEC, CONVERT_SPEC, SETTINGS_SPEC, UNDO_SPEC, REDO_SPEC];

/** Every spec, whatever the writing gate says. */
export const ALL_SPECS = [...READ_SPECS, ...WRITE_SPECS];

/**
 * The output contract registered for one spec: the payload branch plus the closed
 * error branch. Kept here (and not in `lib/tools.js`) so tests can assert the
 * exact schema the harness validates.
 */
export const outputContract = (spec) => ({ oneOf: [spec.output, ERROR_SCHEMA] });

/** The property that keeps `spec`'s payload branch disjoint from the error branch. */
export const discriminatorOf = (spec) => Object.entries(spec.output.properties ?? {})
    .filter(([, child]) => child.required === true)
    .map(([key]) => key);
