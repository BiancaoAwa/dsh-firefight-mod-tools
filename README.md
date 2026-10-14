> Language: **English** | [中文](README.zh-CN.md)

# dsh-firefight-mod-tools

A [DSH](https://github.com/deepseek-ai) plugin that exposes the
[firefight-mod-editor](https://github.com/BiancaoAwa/firefight-mod-editor-open) CLI
(`python -m core.cli`) as agent tools: eight read-only queries plus one approval-gated export.

The plugin is a thin, honest wrapper: it builds `python -m core.cli <scope> <command> [selector] [key=value ...] --json`,
runs it, and hands the CLI's own JSON payload back. It does not re-implement any
parsing, so the answers are exactly what the editor reports.

## Requirements

- A DSH profile (the host provides `@deepseek-ai/dsh-tools` and `@deepseek-ai/cordis`).
- Node.js `^22.19.0 || >=24.0.0`.
- Python 3.10+ on `PATH` (tested with 3.12).
- A firefight-mod-editor checkout — the directory that holds `core/`. The editor's
  default branch carries the CLI, so `main` works; confirm `<editorRoot>/core/cli/__main__.py`
  exists before installing. The CLI is started as `python -m core.cli`, so the
  checkout must be importable rather than a single script.

## Install

From the profile directory, for example `~/.dsh/profiles/desktop`:

```bash
pnpm add /path/to/dsh-firefight-mod-tools
```

Then insert the plugin into `cordis.patch.yml`:

```yaml
- insert:
    - id: dsh-firefight-mod-tools
      name: 'dsh-firefight-mod-tools'
      config:
        pythonPath: python
        editorRoot: 'D:/src/firefight-mod-editor-open/editor-src'
        firefightRoot: 'D:/Program Files (x86)/Steam/steamapps/common/Firefight'
        workspace: 'D:/mods'
```

Restart the profile. A patch entry replaces the whole entry, so list every key you
want to override; omitted keys keep their defaults.

## Configuration

| key | default | meaning |
| --- | --- | --- |
| `pythonPath` | `python` | Interpreter that runs the CLI. |
| `editorRoot` | `''` | Checkout directory holding `core/`; the module is resolved from it. |
| `cliModule` | `core.cli` | Module started with `-m`; override only for a renamed package. |
| `firefightRoot` | `''` | Stock game directory, passed as `root=` for the `Firefight` scope. |
| `workspace` | `''` | Directory holding `Mods/`, passed as `workspace=`. |
| `cwd` | `''` | Working directory of the CLI process; empty means the checkout, which is how the CLI finds `mod.toml`. |
| `timeoutMs` | `60000` | One call is killed after this many milliseconds. |
| `maxOutputChars` | `40000` | Hard cap on the text one tool result carries. |
| `enableExport` | `false` | Register `dsh_ff_export` on its own, when `enableWrites` is not set; it still asks for approval on every call. |
| `enableWrites` | `false` | Register every writing tool in the table below, each of which asks for approval on every call. |

The runner puts `editorRoot` first on the child's `PYTHONPATH`, so a custom `cwd`
does not break `-m core.cli`.

## Tools

`scope` is `Firefight` (stock data), `Mod` (the mod project of the working
directory, the default) or another mod folder name. `root` and `workspace`
override the configured roots for one call.

Every registered name carries the plugin's `dsh_` prefix, so the tools here and the editor's MCP
server (`mcp_<name>`) can be enabled in one session without colliding.

| tool | arguments | answers |
| --- | --- | --- |
| `dsh_ff_list` | `selector`, `type` | Entities of a scope with category, format and size. Start here to find paths. The selector is an exact directory prefix (`Data/Weapons`), not a substring. |
| `dsh_ff_show` | `selector` (required), `as` = `raw`\|`toml`\|`xml` | One document as stored or converted, plus conversion warnings. A selector may name a subtree (`Data/Weapons/WEAPON_PISTOL_P38.txt/ammo`); the answer is then that subtree's values. |
| `dsh_ff_get` | `selector` (required), `field` | Field values with their document path and source line. The field is a dotted path inside the root element, such as `name` or `ammo.type`; without it every field of the document is listed. |
| `dsh_ff_find` | `selector`, `tag`, `value`, `path`, `ignoreCase`, `limit` | Tag, value or document-path matches. At least one of `tag`, `value` or `path` is required, otherwise the CLI stops with a usage error; without a selector the whole scope is searched. `limit` caps the rendered rows while `count` still reports every match. |
| `dsh_ff_stats` | `selector` | File counts by category, format and root element. |
| `dsh_ff_refs` | `selector` (required), `kind` | Outgoing references of an entity or folder. |
| `dsh_ff_deps` | `value` (required), `kind` | Incoming references of a token, plus the entities it resolves to; `kind` narrows them to one reference kind. Check this before renaming or deleting. |
| `dsh_ff_check` | `selector` | Load errors, conversion warnings and dangling references. |
| `dsh_ff_export` | `selector`, `to` (required), `overwrite`, `dryRun` | Renders entities to stock XML under `to`, replacing a file that is already there unless `overwrite=false`. **Writes files.** |
| `dsh_ff_set` | `selector` (required), `field` (required), `value`, `op` = `set`\|`append`\|`delete`, `from`, `dryRun` | Sets one field, or adds and deletes one entry of an array of tables. Every other byte of the document stays as it was. **Writes files.** |
| `dsh_ff_add` | `selector` (required), `type`, `from`, `dryRun` | Creates one entity document from the schema skeleton, or copies `from` an existing document. **Writes files.** |
| `dsh_ff_remove` | `selector` (required), `dryRun` | Deletes one entity document. **Writes files.** |
| `dsh_ff_index` | `selector`, `dryRun` | Writes `.editor/index.toml` and `.editor/refs.toml`; `dsh_ff_refs` and `dsh_ff_deps` answer from those tables and fall back to a fresh scan when they are missing or stale. **Writes files.** |
| `dsh_ff_convert` | `selector`, `to` (required), `type`, `overwrite`, `dryRun` | Turns stock XML into project working files under `to`, keeping a file that is already there unless `overwrite=true`. **Writes files.** |
| `dsh_ff_settings` | `op` = `render`\|`emit`, `overwrite`, `dryRun` | Renders `Mod/mod.txt` into `mod_setting.toml`, or emits the project file back into the stock form. **Writes files.** |
| `dsh_ff_undo` | `count`, `dryRun` | Puts back what the last writes replaced, newest change first. **Writes files.** |
| `dsh_ff_redo` | `count`, `dryRun` | Replays what the newest undos put back, oldest first. **Writes files.** |

The CLI reads `key=value` arguments positionally, so a selector that itself
contains `=` (a folder named `eq=file.toml`) is taken as an option and the call
silently widens to the whole scope; rename such a folder. `limit` is only
declared by `dsh_ff_find`.

## Behaviour

- **Payload first.** Any stdout that parses as JSON is the result, even when the
  CLI exits non-zero — `dsh_ff_check` reports findings that way. An answer without a
  JSON payload becomes a structured error value with a stable code (`usage`,
  `cli-error`, `timeout`, `cancelled`, `empty-output`); a CLI process that cannot
  be started at all is raised as an infrastructure failure.
- **Disjoint shapes.** Each tool's output contract is a `oneOf` of the CLI payload
  and this plugin's structured error value, and the harness rejects a result that
  matches none or several branches. Every payload branch therefore marks exactly one
  property required, and that property is one an error value never carries
  (`status`), so exactly one branch matches either a payload or an error value.
- **Writing asks.** The writing tools are registered when `enableWrites` is true, or
  `dsh_ff_export` alone when only `enableExport` is, and every call stops at the
  approval prompt. When no approval channel is available the harness denies the call
  instead of running it.
- **Bounded output.** Every list section is capped at 100 rows (`dsh_ff_show` prints
  a whole document in full but caps a subtree at 100 values; `dsh_ff_check` caps each
  of its two lists), and
  `maxOutputChars` caps the whole result. `dsh_ff_list`, `dsh_ff_refs` and `dsh_ff_deps`
  payloads can hold thousands of rows, so the caps are the only protection.
- **Concurrency.** The eight read-only tools declare themselves concurrency safe; no
  writing tool does, so writes never overlap.

## Development

```bash
# auto-install-peers is off because the harness peers are provided by the DSH host,
# not by this repository, and the peer tree is not fully published.
pnpm install --config.auto-install-peers=false
node --test "test/*.test.js"     # or: pnpm test
```

A directory argument is not expanded by the Node test runner, so pass the glob
(or a bare `node --test`, which searches `test/`). A sandbox that blocks named
pipes makes the runner fail with `spawn EPERM`, because it starts one child per
test file; importing the `test/*.test.js` files into a single Node process runs
the same suite without child processes.

`test/plugin.test.js` prefers the real `defineTool` and falls back to the bundled
contract stand-in `test/harness-stub.js` when `@deepseek-ai/dsh-tools` cannot be
imported, because the host provides that peer rather than this repository.
`test/real-harness.test.js` runs the same output-schema checks against the real
validator when the peer is importable, and skips itself otherwise. The other
files test the runner, the call normalization, the renderers, the specs and the
approval gate without the harness.

## License

GPL-3.0. See [LICENSE](LICENSE).

