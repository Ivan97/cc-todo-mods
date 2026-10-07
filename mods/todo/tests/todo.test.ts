import { describe, expect, mock, test } from 'claude-code/testing'

import { defaultDue, formatDue, hydrateTodos, parseDueInput, sortTodos } from '../hooks/register'
import type { Importance, Todo } from '../types'

function makeTodo(id: string, importance: Importance, due: string, done = false): Todo {
  return { id, title: id, notes: null, due, tags: [], importance, done, createdAt: due, doneAt: null }
}

describe('defaultDue 默认截止时间', () => {
  test('18 点前默认当天 20:00', () => {
    const now = new Date(2026, 9, 7, 15, 30)
    expect(defaultDue(now)).toBe(new Date(2026, 9, 7, 20, 0).toISOString())
  })
  test('18 点整起默认次日 14:00', () => {
    const now = new Date(2026, 9, 7, 18, 0)
    expect(defaultDue(now)).toBe(new Date(2026, 9, 8, 14, 0).toISOString())
  })
  test('深夜同样默认次日 14:00', () => {
    const now = new Date(2026, 9, 7, 23, 59)
    expect(defaultDue(now)).toBe(new Date(2026, 9, 8, 14, 0).toISOString())
  })
})

describe('parseDueInput 截止时间解析', () => {
  const now = new Date(2026, 9, 7, 10, 0)
  test('留空走默认', () => {
    expect(parseDueInput('   ', now)).toBe(defaultDue(now))
  })
  test('HH:mm 且今天未过', () => {
    expect(parseDueInput('14:30', now)).toBe(new Date(2026, 9, 7, 14, 30).toISOString())
  })
  test('HH:mm 已过则滚到明天', () => {
    expect(parseDueInput('9:00', now)).toBe(new Date(2026, 9, 8, 9, 0).toISOString())
  })
  test('M-D HH:mm', () => {
    expect(parseDueInput('10-9 14:00', now)).toBe(new Date(2026, 9, 9, 14, 0).toISOString())
  })
  test('YYYY-M-D 不带时间默认当天 20:00', () => {
    expect(parseDueInput('2026-12-1', now)).toBe(new Date(2026, 11, 1, 20, 0).toISOString())
  })
  test('非法输入返回 null', () => {
    expect(parseDueInput('下周三', now)).toBe(null)
    expect(parseDueInput('25:00', now)).toBe(null)
    expect(parseDueInput('13-45', now)).toBe(null)
  })
})

describe('sortTodos 分组排序', () => {
  test('重要程度分组（紧急→重要→一般），组内未完成在前、截止倒序', () => {
    const sorted = sortTodos([
      makeTodo('g1', 'general', '2026-10-09T10:00:00'),
      makeTodo('u2', 'urgent-important', '2026-10-08T10:00:00'),
      makeTodo('i1', 'important', '2026-10-10T10:00:00'),
      makeTodo('u1', 'urgent-important', '2026-10-07T10:00:00'),
      makeTodo('ud', 'urgent-important', '2026-10-11T10:00:00', true),
    ])
    expect(sorted.map(t => t.id)).toEqual(['u2', 'u1', 'ud', 'i1', 'g1'])
  })
})

describe('formatDue 展示格式', () => {
  const nowMs = new Date(2026, 9, 7, 21, 0).getTime()
  test('今天/明天/同年绝对日期/跨年带年份', () => {
    expect(formatDue(new Date(2026, 9, 7, 22, 0).toISOString(), nowMs)).toBe('今天 22:00')
    expect(formatDue(new Date(2026, 9, 8, 14, 0).toISOString(), nowMs)).toBe('明天 14:00')
    expect(formatDue(new Date(2026, 9, 10, 9, 5).toISOString(), nowMs)).toBe('10-10 09:05')
    expect(formatDue(new Date(2027, 0, 2, 9, 0).toISOString(), nowMs)).toBe('2027-1-2 09:00')
  })
})

describe('hydrateTodos 从 $.store 恢复', () => {
  const stored: Todo[] = [makeTodo('a', 'general', '2026-10-08T12:00:00.000Z')]

  function makeDeps(opts: { hydrated?: boolean; stored?: unknown } = {}) {
    const state = { todos: [] as Todo[], hydrated: opts.hydrated ?? false }
    const calls: string[] = []
    return {
      state,
      calls,
      deps: {
        wasHydrated: async () => state.hydrated,
        markHydrated: async () => {
          calls.push('markHydrated')
          state.hydrated = true
        },
        readStoredTodos: async () => {
          calls.push('readStored')
          return opts.stored ?? stored
        },
        writeTodos: async (list: Todo[]) => {
          calls.push('writeTodos')
          state.todos = list
        },
      },
    }
  }

  test('未水合时从 store 读数组写入 todos', async () => {
    const { deps, state } = makeDeps()
    await hydrateTodos(deps)
    expect(state.todos).toBe(stored)
    expect(state.hydrated).toBe(true)
  })

  test('已水合时跳过（不读 store 不写 todos）', async () => {
    const { deps, calls } = makeDeps({ hydrated: true })
    await hydrateTodos(deps)
    expect(calls).toEqual([])
  })

  test('store 值损坏（非数组）时写入空列表', async () => {
    const { deps, state } = makeDeps({ stored: 'oops' })
    await hydrateTodos(deps)
    expect(state.todos).toEqual([])
    expect(state.hydrated).toBe(true)
  })
})

describe('看板 UI：新增表单', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}：列表按「新增」进入表单，填写后保存`, async ($, on) => {
      mock.clock(on, { now: Date.UTC(2026, 9, 7, 12) })
      mock.store(on)
      on('ui.open', () => ({ value: { isPlaced: true } }))
      const ui = await $.ui.mount({
        plugin: 'todo',
        surface,
        component: 'Pane',
        requestId: 'todo',
        props: {},
      })

      expect(await ui.find({ key: 'list-new' })).toBeTruthy()

      await ui.press({ key: 'list-new' })

      expect(await ui.find({ key: 'form-title' })).toBeTruthy()

      await ui.input({ key: 'form-title', text: '表单新增测试', kind: 'change' })
      await ui.press({ key: 'form-save' })

      expect(await ui.find({ text: '表单新增测试' })).toBeTruthy()
    })
  }
})

describe('看板 UI：从 $.store 恢复（/clear 后的路径）', () => {
  const stored: Todo[] = [
    { ...makeTodo('restore-1', 'urgent-important', '2026-10-08T02:00:00.000Z'), title: '恢复的待办' },
  ]

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}：classic.SessionStart(source='clear') 后列表显示已存待办`, async ($, on) => {
      mock.clock(on, { now: Date.UTC(2026, 9, 7, 12) })
      mock.store(on, { todos: stored })
      on('ui.open', () => ({ value: { isPlaced: true } }))
      on('classic.SessionStart', () => ({}))

      // /clear 语义：classic.SessionStart 以 source='clear' 触发，水合在事件里完成
      await $.classic.SessionStart({ source: 'clear' })

      const ui = await $.ui.mount({
        plugin: 'todo',
        surface,
        component: 'Pane',
        requestId: 'todo',
        props: {},
      })

      expect(await ui.find({ text: '恢复的待办' })).toBeTruthy()
      expect(await ui.find({ key: 'open-restore-1' })).toBeTruthy()
    })
  }
})
