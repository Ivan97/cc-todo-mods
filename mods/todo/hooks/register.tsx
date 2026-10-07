import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Importance, Todo, TodoForm } from '../types'

const PANE = 'todo'
const ASK = 'todo-ask'

// ---------- state refs ----------
// $.state.set 只收本文件内的字面量 const 引用；atom 是 { ref, initial } 包装，只进 read/update
const todosRef = { plugin: 'todo', key: 'todos' } as const
const viewRef = { plugin: 'todo', key: 'view' } as const
const formModeRef = { plugin: 'todo', key: 'formMode' } as const
const formTargetIdRef = { plugin: 'todo', key: 'formTargetId' } as const
const formRef = { plugin: 'todo', key: 'form' } as const
const formErrorRef = { plugin: 'todo', key: 'formError' } as const
const hideDoneRef = { plugin: 'todo', key: 'hideDone' } as const
const detailIdRef = { plugin: 'todo', key: 'detailId' } as const
const appliedRef = { plugin: 'todo', key: 'applied' } as const
const askRef = { plugin: 'todo', key: 'ask' } as const
const hydratedRef = { plugin: 'todo', key: 'hydrated' } as const

const todos = atom(todosRef, [])
const view = atom(viewRef, 'list')
const formMode = atom(formModeRef, 'new')
const formTargetId = atom(formTargetIdRef, null)
const form = atom(formRef, {
  title: '',
  notes: '',
  due: '',
  tags: '',
  importance: 'general',
} as TodoForm)
const formError = atom(formErrorRef, null)
const hideDone = atom(hideDoneRef, false)
const detailId = atom(detailIdRef, null)
const applied = atom(appliedRef, null)
const ask = atom(askRef, null)
/** 本 session 是否已从 $.store 恢复过 todos（atom 未写入时读初始值，永非 undefined，须靠哨兵判断） */
const hydrated = atom(hydratedRef, false)

// ---------- importance ----------
const IMPORTANCES: readonly Importance[] = ['urgent-important', 'important', 'general']
const IMPORTANCE_LABEL: Record<Importance, string> = {
  'urgent-important': '🔴 重要紧急',
  important: '🟡 重要不紧急',
  general: '⚪ 一般事件',
}
const IMPORTANCE_PLAIN: Record<Importance, string> = {
  'urgent-important': '重要紧急',
  important: '重要不紧急',
  general: '一般事件',
}
const IMPORTANCE_ORDER: Record<Importance, number> = {
  'urgent-important': 0,
  important: 1,
  general: 2,
}

// ---------- pure helpers (exported for tests) ----------

/** 默认截止：当天 20:00；过了当天 18:00 则次日 14:00 */
export function defaultDue(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (now.getHours() >= 18) {
    d.setDate(d.getDate() + 1)
    d.setHours(14, 0, 0, 0)
  } else {
    d.setHours(20, 0, 0, 0)
  }
  return d.toISOString()
}

/** 解析截止输入：'' → 默认；HH:mm；M-D [HH:mm]；YYYY-M-D [HH:mm]；解析失败返回 null */
export function parseDueInput(text: string, now: Date): string | null {
  const t = text.trim()
  if (t === '') return defaultDue(now)

  let m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (m) {
    const h = Number(m[1])
    const mi = Number(m[2])
    if (h > 23 || mi > 59) return null
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi)
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1)
    return d.toISOString()
  }

  m = /^(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t)
  if (m) {
    const mo = Number(m[1])
    const day = Number(m[2])
    const h = m[3] === undefined ? 20 : Number(m[3])
    const mi = m[4] === undefined ? 0 : Number(m[4])
    if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null
    const d = new Date(now.getFullYear(), mo - 1, day, h, mi)
    if (d.getMonth() !== mo - 1 || d.getDate() !== day) return null
    if (d.getTime() < now.getTime()) d.setFullYear(d.getFullYear() + 1)
    return d.toISOString()
  }

  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const day = Number(m[3])
    const h = m[4] === undefined ? 20 : Number(m[4])
    const mi = m[5] === undefined ? 0 : Number(m[5])
    if (mo < 1 || mo > 12 || h > 23 || mi > 59) return null
    const d = new Date(y, mo - 1, day, h, mi)
    if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null
    return d.toISOString()
  }

  return null
}

/** 排序：重要程度分组（重要紧急 → 重要不紧急 → 一般），组内未完成在前，截止倒序（晚的在前） */
export function sortTodos(list: readonly Todo[]): Todo[] {
  return [...list].sort((a, b) => {
    const g = IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]
    if (g !== 0) return g
    if (a.done !== b.done) return a.done ? 1 : -1
    return Date.parse(b.due) - Date.parse(a.due)
  })
}

export function isOverdue(todo: Todo, nowMs: number): boolean {
  return !todo.done && Date.parse(todo.due) <= nowMs
}

/** 展示：今天/明天 HH:mm；同年 M-D HH:mm；跨年带年份 */
export function formatDue(iso: string, nowMs: number): string {
  const d = new Date(iso)
  const now = new Date(nowMs)
  const two = (n: number) => String(n).padStart(2, '0')
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, now)) return `今天 ${hm}`
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (sameDay(d, tomorrow)) return `明天 ${hm}`
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}-${d.getDate()} ${hm}`
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${hm}`
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function blankForm(): TodoForm {
  return { title: '', notes: '', due: '', tags: '', importance: 'general' }
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, max).join('')}…`
}

/** hydrateTodos 的最小依赖集，便于单测 */
export type HydrateDeps = {
  wasHydrated(): Promise<boolean>
  markHydrated(): Promise<void>
  readStoredTodos(): Promise<unknown>
  writeTodos(list: Todo[]): Promise<void>
}

/**
 * 每个 session 从 $.store 恢复一次 todos。
 * 两个前提：atom 未写入时读到的是初始值（永非 undefined），不能靠值判断；
 * /clear 后进程续用新 session id 且不再触发 session.start，恢复点须含渲染路径。
 */
export async function hydrateTodos(deps: HydrateDeps): Promise<void> {
  if (await deps.wasHydrated()) return
  const stored = await deps.readStoredTodos()
  await deps.writeTodos(Array.isArray(stored) ? (stored as Todo[]) : [])
  await deps.markHydrated()
}

/** 接线版：永不 reject，session.start 可 await，渲染路径可 fire-and-forget */
const hydrate = ($: EngineInterface): Promise<void> =>
  hydrateTodos({
    wasHydrated: () => read($, hydrated),
    markHydrated: () => $.state.set(hydratedRef, true),
    readStoredTodos: () => $.store.get('todos'),
    writeTodos: list => $.state.set(todosRef, list),
  }).catch(() => {})

// ---------- hooks ----------
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'todo',
      description: '待办看板：/todo 打开，/todo <标题> 快速添加',
    })
    await hydrate($)
    return next(e)
  })

  // /clear 后进程换新 session id、不再触发 session.start，但 classic.SessionStart
  // 会以 source='clear' 触发；渲染期禁止写 state，恢复必须挂在事件上
  on('classic.SessionStart', async ($, e, next) => {
    await hydrate($)
    return next(e)
  })

  on('command.run', { command: 'todo' }, async ($, e) => {
    await hydrate($)
    const args = e.args.trim()
    if (args !== '') {
      const now = new Date(await $.clock.now())
      const todo: Todo = {
        id: newId(),
        title: truncate(args, 120),
        notes: null,
        due: defaultDue(now),
        tags: [],
        importance: 'general',
        done: false,
        createdAt: now.toISOString(),
        doneAt: null,
      }
      const list = await update($, todos, ts => [todo, ...ts])
      await $.store.set('todos', list)
      $.ui.toast(`已添加待办：${todo.title}`)
    }
    void $.ui.open({ id: PANE, title: '待办' })
    return { text: args === '' ? '待办看板已打开。' : `已添加待办：${truncate(args, 120)}` }
  })

  // 提交（而非应用）后，若提交内容含被应用的待办标题，弹窗询问是否标记完成
  on('prompt.submit', async ($, e, next) => {
    const entered = await next(e)
    const appliedTodo = await read($, applied)
    if (appliedTodo != null) {
      await $.state.set(appliedRef, null)
      if (e.text.includes(appliedTodo.title)) {
        await $.state.set(askRef, appliedTodo)
        void $.ui.open({ id: ASK, title: '待办完成确认', focus: true, closeOnEscape: true, rows: 5 })
      }
    }
    return entered
  })

  // Esc 关闭确认框时清掉询问状态
  on('ui.close', { id: ASK }, async ($, e, next) => {
    await $.state.set(askRef, null)
    return next(e)
  })

  // ---------- 输入框上方摘要 band ----------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = (await read($, todos)) ?? []
    const openItems = list.filter(t => !t.done)
    if (openItems.length === 0 || e.props.hasSurvey) return next(e)

    const nowMs = await $.clock.now()
    const urgentCount = openItems.filter(t => t.importance === 'urgent-important').length
    const sorted = [...openItems].sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
    const soonest = sorted[0]
    if (!soonest) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const dueText = isOverdue(soonest, nowMs) ? `⚠${formatDue(soonest.due, nowMs)}` : formatDue(soonest.due, nowMs)

    return (
      <Box>
        <Text dimColor>
          📋 待办 {openItems.length}
          {urgentCount > 0 ? ` · 🔴${urgentCount}` : ''} · ⏰ {dueText} {truncate(soonest.title, 16)}{' '}
        </Text>
        <Button
          key="open-todo"
          label="看板"
          hotkey="o"
          onPress={() => void $.ui.open({ id: PANE, title: '待办', focus: true })}
        />
      </Box>
    )
  })

  // ---------- 侧边栏看板 ----------
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Select, Text } = $.ui.resolve(e)
    const nowMs = await $.clock.now()
    const now = new Date(nowMs)
    const list = (await read($, todos)) ?? []
    const v = (await read($, view)) ?? 'list'
    const hideDoneValue = (await read($, hideDone)) ?? false
    const detailIdValue = await read($, detailId)
    const formValue = (await read($, form)) ?? blankForm()
    const formModeValue = (await read($, formMode)) ?? 'new'
    const formTargetIdValue = await read($, formTargetId)
    const formErrorValue = await read($, formError)
    const detail = detailIdValue != null ? list.find(t => t.id === detailIdValue) : undefined
    const target = formTargetIdValue != null ? list.find(t => t.id === formTargetIdValue) : undefined

    // ----- actions -----
    const openFocused = () => void $.ui.open({ id: PANE, title: '待办', focus: true })
    const goList = async () => {
      await $.state.set(viewRef, 'list')
    }
    const openDetail = async (id: string) => {
      await $.state.set(detailIdRef, id)
      await $.state.set(viewRef, 'detail')
    }
    const startNew = async () => {
      await $.state.set(formRef, blankForm())
      await $.state.set(formModeRef, 'new')
      await $.state.set(formTargetIdRef, null)
      await $.state.set(formErrorRef, null)
      await $.state.set(viewRef, 'form')
      openFocused()
    }
    const startEdit = async (id: string) => {
      const t = list.find(x => x.id === id)
      if (!t) return
      await $.state.set(formRef, {
        title: t.title,
        notes: t.notes ?? '',
        due: '',
        tags: t.tags.join(', '),
        importance: t.importance,
      })
      await $.state.set(formModeRef, 'edit')
      await $.state.set(formTargetIdRef, id)
      await $.state.set(formErrorRef, null)
      await $.state.set(viewRef, 'form')
      openFocused()
    }
    const setForm = (patch: Partial<TodoForm>) => {
      void update($, form, f => ({ ...(f ?? blankForm()), ...patch }))
    }
    const toggle = async (id: string) => {
      const doneAt = new Date(await $.clock.now()).toISOString()
      const next = await update($, todos, ts =>
        ts.map(t => (t.id === id ? { ...t, done: !t.done, doneAt: !t.done ? doneAt : null } : t)),
      )
      await $.store.set('todos', next)
    }
    const remove = async (id: string) => {
      const next = await update($, todos, ts => ts.filter(t => t.id !== id))
      await $.store.set('todos', next)
      $.ui.toast('已删除待办')
      await goList()
    }
    const saveForm = async () => {
      const f = (await read($, form)) ?? blankForm()
      const mode = (await read($, formMode)) ?? 'new'
      const targetId = await read($, formTargetId)
      const editing = mode === 'edit' && targetId != null ? list.find(t => t.id === targetId) : undefined
      const title = f.title.trim()
      if (title === '') {
        await $.state.set(formErrorRef, '标题必填')
        return
      }
      const due =
        f.due.trim() === '' && editing ? editing.due : parseDueInput(f.due, now)
      if (due == null) {
        await $.state.set(formErrorRef, '截止时间无法解析（支持 HH:mm、M-D HH:mm、YYYY-M-D HH:mm，留空用默认）')
        return
      }
      const tags = f.tags
        .split(/[,，;；\s]+/)
        .map(s => s.trim().replace(/^#/, ''))
        .filter(s => s !== '')
      const notes = f.notes.trim() === '' ? null : f.notes.trim()
      if (editing) {
        const next = await update($, todos, ts =>
          ts.map(t => (t.id === editing.id ? { ...t, title, notes, due, tags, importance: f.importance } : t)),
        )
        await $.store.set('todos', next)
        $.ui.toast('已保存')
        await $.state.set(formErrorRef, null)
        await openDetail(editing.id)
      } else {
        const todo: Todo = {
          id: newId(),
          title,
          notes,
          due,
          tags,
          importance: f.importance,
          done: false,
          createdAt: new Date(await $.clock.now()).toISOString(),
          doneAt: null,
        }
        const next = await update($, todos, ts => [todo, ...ts])
        await $.store.set('todos', next)
        $.ui.toast('已添加待办')
        await $.state.set(formErrorRef, null)
        await openDetail(todo.id)
      }
    }
    const applyTodo = async (t: Todo) => {
      const lines = [`请处理待办：${t.title}`]
      if (t.notes != null) lines.push(`备注：${t.notes}`)
      lines.push(`优先级：${IMPORTANCE_PLAIN[t.importance]}；截止：${formatDue(t.due, nowMs)}`)
      if (t.tags.length > 0) lines.push(`标签：${t.tags.map(x => `#${x}`).join(' ')}`)
      const filled = await $.prompt.fill({ text: lines.join('\n'), mode: 'insert' })
      if (filled.isFilled) {
        await $.state.set(appliedRef, { id: t.id, title: t.title })
        $.ui.toast('已应用到输入框；提交后可标记完成')
        void $.ui.close({ id: PANE })
      } else {
        $.ui.toast(filled.refusal === 'dialog' ? '请先按 Esc 让键盘回到输入框，再应用' : '当前无法写入输入框')
      }
    }

    // ----- form view -----
    if (v === 'form') {
      const isEdit = formModeValue === 'edit' && target != null
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{isEdit ? '编辑待办' : '新增待办'}</Text>
          <Input
            key="form-title"
            label="标题"
            placeholder="必填"
            value={formValue.title}
            autoFocus
            onInput={value => setForm({ title: value })}
            onSubmit={() => void saveForm()}
          />
          <Input
            key="form-notes"
            label="备注"
            placeholder="可留空"
            value={formValue.notes}
            onInput={value => setForm({ notes: value })}
            onSubmit={() => void saveForm()}
          />
          <Input
            key="form-due"
            label="截止"
            placeholder={
              isEdit && target
                ? `留空保持不变（当前 ${formatDue(target.due, nowMs)}）`
                : '留空=今天20:00（18点后为明天14:00）'
            }
            value={formValue.due}
            onInput={value => setForm({ due: value })}
            onSubmit={() => void saveForm()}
          />
          <Input
            key="form-tags"
            label="标签"
            placeholder="逗号分隔，可留空"
            value={formValue.tags}
            onInput={value => setForm({ tags: value })}
            onSubmit={() => void saveForm()}
          />
          <Select
            key="form-importance"
            label="重要程度"
            value={formValue.importance}
            options={IMPORTANCES.map(imp => ({ value: imp, label: IMPORTANCE_PLAIN[imp] }))}
            onSelect={value => setForm({ importance: value as Importance })}
          />
          {formErrorValue != null && <Text color="error">{formErrorValue}</Text>}
          <Box gap={1}>
            <Button key="form-save" label="保存" hotkey="s" variant="primary" onPress={() => void saveForm()} />
            <Button
              key="form-cancel"
              label="取消"
              onPress={() => void $.state.set(viewRef, isEdit ? 'detail' : 'list')}
            />
          </Box>
        </Box>
      )
    }

    // ----- detail view -----
    if (v === 'detail' && detail) {
      const t = detail
      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>{t.title}</Text>
          <Text dimColor>状态：{t.done ? '✓ 已完成' : isOverdue(t, nowMs) ? '⚠ 已逾期' : '进行中'}</Text>
          <Text>重要程度：{IMPORTANCE_LABEL[t.importance]}</Text>
          <Text>截止：{formatDue(t.due, nowMs)}{isOverdue(t, nowMs) ? '（已逾期）' : ''}</Text>
          <Text>标签：{t.tags.length > 0 ? t.tags.map(x => `#${x}`).join(' ') : '—'}</Text>
          <Text>备注：{t.notes ?? '—'}</Text>
          <Box gap={1}>
            <Button key="detail-apply" label="应用" hotkey="a" variant="primary" onPress={() => void applyTodo(t)} />
            <Button key="detail-edit" label="编辑" hotkey="e" onPress={() => void startEdit(t.id)} />
            <Button key="detail-toggle" label={t.done ? '重开' : '完成'} onPress={() => void toggle(t.id)} />
            <Button key="detail-del" label="删除" onPress={() => void remove(t.id)} />
            <Button key="detail-back" label="返回" onPress={() => void goList()} />
          </Box>
        </Box>
      )
    }

    // ----- list view (default) -----
    const shown = sortTodos(hideDoneValue ? list.filter(t => !t.done) : list)
    const groups = IMPORTANCES.map(imp => ({ imp, items: shown.filter(t => t.importance === imp) })).filter(
      g => g.items.length > 0,
    )
    const openCount = list.filter(t => !t.done).length
    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold>📋 待办（未完成 {openCount}）</Text>
          <Box gap={1}>
            <Button key="list-new" label="新增" hotkey="n" variant="primary" onPress={() => void startNew()} />
            <Button
              key="list-hide"
              label={hideDoneValue ? '显示已完成' : '隐藏已完成'}
              onPress={() => void update($, hideDone, h => !h)}
            />
            <Button key="list-close" label="✕" onPress={() => void $.ui.close({ id: PANE })} />
          </Box>
        </Box>
        {groups.length === 0 && (
          <Text dimColor>暂无待办。按 n 新增，或在输入框输入 /todo 标题 快速添加。</Text>
        )}
        {groups.map(({ imp, items }) => (
          <Box key={imp} flexDirection="column">
            <Text
              color={imp === 'urgent-important' ? 'error' : imp === 'important' ? 'warning' : undefined}
              dimColor={imp === 'general'}
            >
              {IMPORTANCE_LABEL[imp]}（{items.length}）
            </Text>
            {items.map(t => (
              <Box key={t.id}>
                <Button key={`done-${t.id}`} plain label={t.done ? '☑' : '☐'} onPress={() => void toggle(t.id)} />
                <Text dimColor={t.done} color={!t.done && isOverdue(t, nowMs) ? 'error' : undefined}>
                  {formatDue(t.due, nowMs)}{' '}
                </Text>
                <Button
                  key={`open-${t.id}`}
                  plain
                  label={t.title}
                  dimColor={t.done}
                  onPress={() => void openDetail(t.id)}
                />
                {t.tags.length > 0 && <Text dimColor> {t.tags.map(x => `#${x}`).join(' ')}</Text>}
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })

  // ---------- 提交后确认对话框 ----------
  on('ui.render', { component: 'Pane', requestId: ASK }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const asking = (await read($, ask)) ?? null
    if (asking == null) {
      return (
        <Box flexDirection="column">
          <Text dimColor>已处理。</Text>
        </Box>
      )
    }
    const markDone = async () => {
      const doneAt = new Date(await $.clock.now()).toISOString()
      const next = await update($, todos, ts =>
        ts.map(t => (t.id === asking.id ? { ...t, done: true, doneAt } : t)),
      )
      await $.store.set('todos', next)
      await $.state.set(askRef, null)
      $.ui.toast(`✓ 已完成：${asking.title}`)
      void $.ui.close({ id: ASK })
    }
    const skip = async () => {
      await $.state.set(askRef, null)
      void $.ui.close({ id: ASK })
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text>已提交「{truncate(asking.title, 40)}」相关任务。标记该待办为完成？</Text>
        <Box gap={1}>
          <Button key="ask-yes" label="标记完成" hotkey="y" variant="primary" onPress={() => void markDone()} />
          <Button key="ask-no" label="跳过" hotkey="n" onPress={() => void skip()} />
        </Box>
      </Box>
    )
  })
}
