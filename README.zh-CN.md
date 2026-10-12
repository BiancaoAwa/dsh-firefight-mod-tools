> 语言：**中文** | [English](README.md)

# dsh-firefight-mod-tools（中文）

这是一个 [DSH](https://github.com/deepseek-ai) 插件，把
[firefight-mod-editor](https://github.com/BiancaoAwa/firefight-mod-editor-open) 命令行
（`python -m core.cli`）暴露为智能体工具：八个只读查询，加一个需要逐次审批的导出。

插件只做转发：它拼出 `python -m core.cli <scope> <command> [selector] [key=value ...] --json`，
运行后把命令行自己输出的 JSON 原样交回。插件不重新实现解析，因此返回结果与编辑器报告完全一致。

## 依赖

- DSH profile（`@deepseek-ai/dsh-tools` 与 `@deepseek-ai/cordis` 由宿主提供）。
- Node.js `^22.19.0 || >=24.0.0`。
- `PATH` 上有 Python 3.10+（实测 3.12）。
- 一份 firefight-mod-editor 检出目录，即含 `core/` 的目录。编辑器默认分支已带命令行工具，
  `main` 即可；安装前确认 `<editorRoot>/core/cli/__main__.py` 存在。命令行以
  `python -m core.cli` 启动，所以需要的是可导入的检出目录，而不是单个脚本。

## 安装

在 profile 目录（例如 `~/.dsh/profiles/desktop`）执行：

```bash
pnpm add /path/to/dsh-firefight-mod-tools
```

然后在 `cordis.patch.yml` 里插入插件：

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

重启 profile。patch 条目整体替换，不深合并，因此要覆盖的键必须全部列出；省略的键取默认值。

## 配置

| 键 | 默认值 | 含义 |
| --- | --- | --- |
| `pythonPath` | `python` | 运行命令行的解释器。 |
| `editorRoot` | `''` | 含 `core/` 的检出目录，模块从它解析。 |
| `cliModule` | `core.cli` | 用 `-m` 启动的模块；仅在包被改名时需要覆盖。 |
| `firefightRoot` | `''` | 原版游戏目录，`Firefight` 作用域下作为 `root=` 传入。 |
| `workspace` | `''` | 含 `Mods/` 的目录，作为 `workspace=` 传入。 |
| `cwd` | `''` | 命令行进程的工作目录；留空则用检出目录，命令行据此找到 `mod.toml`。 |
| `timeoutMs` | `60000` | 单次调用超过该毫秒数即被终止。 |
| `maxOutputChars` | `40000` | 单个工具结果文本的硬上限。 |
| `enableExport` | `false` | 是否注册写文件的 `ff_export` 工具；注册后每次调用仍需审批。 |

运行器把 `editorRoot` 放在子进程 `PYTHONPATH` 的第一位，因此自定义 `cwd` 不会破坏 `-m core.cli`。

## 工具

`scope` 取 `Firefight`（原版数据）、`Mod`（工作目录下的模组工程，默认值）或其它模组文件夹名。
`root` 与 `workspace` 可对单次调用覆盖已配置的根目录。

| 工具 | 参数 | 返回 |
| --- | --- | --- |
| `ff_list` | `selector`、`type` | 某作用域下实体的类别、格式与大小。先用它找路径。selector 是精确的目录前缀（`Data/Weapons`），不是子串。 |
| `ff_show` | `selector`（必填）、`as` = `raw`\|`toml`\|`xml` | 单个文档的原样或转换内容，外加转换警告。selector 可指向子树（`Data/Weapons/WEAPON_PISTOL_P38.txt/ammo`），此时返回该子树的值。 |
| `ff_get` | `selector`（必填）、`field` | 字段值及其文档路径与源文件行号。field 是根元素内的点号路径，例如 `name` 或 `ammo.type`。 |
| `ff_find` | `selector`、`tag`、`value`、`path`、`ignoreCase`、`limit` | 按标签、值或文档路径匹配。`tag`、`value`、`path` 至少给一个，否则命令行以用法错误退出；不给 selector 时搜索整个作用域。`limit` 同时限制载荷与渲染行数。 |
| `ff_stats` | `selector` | 按类别、格式与根元素统计文件数与字节数。 |
| `ff_refs` | `selector`（必填）、`kind` | 某个实体或文件夹的出向引用。 |
| `ff_deps` | `value`（必填）、`kind` | 某个 token 的入向引用及它解析到的实体；`kind` 收窄为一种引用类型。改名或删除前应先查这里。 |
| `ff_check` | `selector` | 载入错误、转换警告与悬空引用。 |
| `ff_export` | `selector`、`to`（必填） | 把实体渲染成原版 XML 写到 `to`。**会写文件。** |

命令行按位置解析 `key=value`，因此名字里含 `=` 的 selector（例如名为 `eq=file.toml` 的文件夹）
会被当成选项，调用会静默扩大到整个作用域；这类文件夹需要改名。`limit` 只被 `ff_find` 采用。

## 行为

- **载荷优先。** stdout 只要能解析成 JSON 就是结果，命令行以非零码退出也一样——`ff_check`
  就是这样报告问题的。没有 JSON 载荷的回答会转成带稳定错误码的结构化错误值（`usage`、
  `cli-error`、`timeout`、`cancelled`、`empty-output`）；完全启动不了的命令行进程则作为基础设施
  故障抛出。
- **形状互斥。** 每个工具的输出契约是「命令行载荷 ∪ 本插件的结构化错误值」的 `oneOf`，宿主会拒绝
  同时匹配零个或多个分支的结果。因此每个载荷分支都强制要求一个属性（`scope`，`ff_show`/`ff_get`
  用 `path`，`ff_find` 用 `count`），保证要么只匹配载荷、要么只匹配错误值。
- **导出要审批。** 只有 `enableExport` 为真才注册 `ff_export`，且每次调用都停在审批提示上；没有
  审批通道时宿主直接拒绝，而不是绕过。
- **输出有界。** 每个列表段最多 100 行（`ff_show` 完整打印整篇文档，但子树最多 100 个值；
  `ff_check` 的两个列表各自设上限），整体结果另受 `maxOutputChars` 限制。`ff_list`、`ff_refs`、
  `ff_deps` 的载荷可能有数千行，这些上限是唯一的保护。
- **并发。** 八个只读工具声明可并发；`ff_export` 不声明，因此导出不会重叠执行。

## 开发

```bash
# 关闭 auto-install-peers：宿主依赖由 DSH 提供，本仓库不提供，且 peer 树未完全发布。
pnpm install --config.auto-install-peers=false
node --test "test/*.test.js"     # 或：pnpm test
```

Node 测试运行器不会展开目录参数，所以要么传 glob，要么直接 `node --test`（它会搜 `test/`）。
在禁用命名管道的沙箱里，运行器会因每个测试文件各起一个子进程而报 `spawn EPERM`；把
`test/*.test.js` 导入同一个 Node 进程即可跑同一套测试，不产生子进程。

`test/plugin.test.js` 优先使用真实的 `defineTool`，在无法导入 `@deepseek-ai/dsh-tools` 时退回
仓库内置的契约替身 `test/harness-stub.js`——该 peer 由宿主提供，不在本仓库。
`test/real-harness.test.js` 在能导入该 peer 时用真实校验器跑同一套输出模式检查，否则自行跳过。
其余文件不依赖宿主，分别测试运行器、调用归一化、渲染器、specs 与审批门。

## 许可

GPL-3.0，见 [LICENSE](LICENSE)。

