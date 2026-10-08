# cc-todo-mods

Claude Code 的待办（todo）mod 合集。首个 mod：**todo** —— 一个活在 Claude Code 界面里的待办看板。

## 功能

- **常驻摘要条**：有未完成待办时，输入框上方自动显示一行摘要（未完成数 · 重要紧急数 · 最近截止项），按 `o` 或点击「看板」打开侧边栏
- **侧边栏看板**（`/todo` 打开）：
  - 增删改查 + 详情查看
  - 字段：标题（必填）、备注（可空）、截止时间、标签、重要程度（重要紧急 / 重要不紧急 / 一般事件）、完成状态
  - 默认截止：当天 20:00；过了当天 18:00 则自动取次日 14:00（也支持 `HH:mm`、`M-D HH:mm`、`YYYY-M-D HH:mm` 手动输入）
  - 列表按重要程度分组（🔴 重要紧急 → 🟡 重要不紧急 → ⚪ 一般事件），组内未完成在前、截止倒序
  - 已逾期项红色高亮，已完成项可一键隐藏/显示
- **快速添加**：输入框直接 `/todo 买牛奶` 即可新增
- **应用到输入框**：详情页按 `a`，把该待办整理成一段提示词填入输入框（可继续编辑）
- **提交后确认**：应用过的待办在你**提交**提示词后（而非应用时）弹出确认框，一键标记完成（`y`）或跳过（`n`）
- **持久化**：待办跨会话保存（Claude Code 插件 store）

## 安装

三选一：

### 方式一：从 GitHub 安装（推荐）

在 Claude Code 终端会话中输入：

```
/plugin install todo --marketplace Ivan97/cc-todo-mods
```

（先 `y` 添加 marketplace，回车选 user 作用域即可。）一条命令完成，不依赖本机路径；后续用 `/plugin` 菜单检查更新。

### 方式二：本机常驻加载（自己在改这个仓库时）

在 `~/.claude/settings.json` 的 `env` 块加入：

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/cc-todo-mods/mods/todo"
  }
}
```

每个 Claude Code 会话（任何项目目录）自动加载，`/clear` 后依然在；保存 mod 文件即热重载，适合开发迭代。改完重启 Claude Code 生效。注意：与方式一不要同时用，否则同一 mod 会被加载两份。

### 方式三：本地文件夹 marketplace（开发调试）

```bash
# 从本仓库文件夹安装（文件夹型 marketplace，编辑后 /reload-plugins 即生效）
claude plugin marketplace add /path/to/cc-todo-mods
# 然后在 Claude Code 里: /plugin install todo --marketplace cc-todo-mods
```

## 使用速查

| 操作 | 入口 |
|---|---|
| 打开看板 | `/todo`，或摘要条按 `o` / 点「看板」 |
| 快速添加 | `/todo 买牛奶`（默认截止：当天 20:00，18 点后次日 14:00） |
| 新增（表单） | 看板内按 `n` 或点「新增」，可填标题/备注/截止/标签/重要程度 |
| 保存表单 | `s`（或回车提交任一输入框） |
| 查看详情 | 看板内点击待办标题 |
| 编辑 / 应用 / 完成 / 删除 | 详情页 `e` / `a` / 完成 / 删除 |
| 提交后确认完成 | 应用过的待办在提交提示词后弹确认框，`y` 标记完成 / `n` 跳过 |

**数据与 /clear**：待办存在 Claude Code 插件 store（`~/.claude/plugins/store/`），跨会话持久；`/clear` 或切换会话后自动恢复（摘要条与看板重新出现）。

## 本地开发

```bash
# 校验 + 测试（引擎级 UI 测试）
claude plugin validate mods/todo
claude plugin test mods/todo

# 类型检查（首次运行前需已用任一方式加载过一次，引擎会在
# mods/todo/.claude-plugin/types/ 铺好类型环境）
cd mods/todo && bunx tsc -p . --noEmit
```

## License

MIT
