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

在 Claude Code 终端会话中输入：

```
/plugin install todo --marketplace <your-github-name>/cc-todo-mods
```

（把 `<your-github-name>` 换成本仓库所在的 GitHub 账号；先 `y` 添加 marketplace，回车选 user 作用域即可。）

## 本地开发

```bash
# 从本仓库文件夹安装（文件夹型 marketplace，编辑后 /reload-plugins 即生效）
claude plugin marketplace add /path/to/cc-todo-mods
# 然后在 Claude Code 里: /plugin install todo --marketplace cc-todo-mods

# 校验 + 测试
claude plugin validate mods/todo
claude plugin test mods/todo
```

## License

MIT
