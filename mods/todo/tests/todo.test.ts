import { describe, expect, mock, test } from 'claude-code/testing'

import {
  buildExtractMessages,
  defaultDue,
  extractFields,
  formatDue,
  hasExtractionCues,
  hydrateTodos,
  parseDueInput,
  parseExtractReply,
  sortTodos,
} from '../hooks/register'
import type { Importance, Todo } from '../types'

function makeTodo(id: string, importance: Importance, due: string, done = false): Todo {
  return { id, title: id, notes: null, due, tags: [], importance, done, createdAt: due, doneAt: null }
}

/** Pane 渲染 props 的合法最小值（RenderPropsOf['Pane'] 必填字段） */
const PANE_PROPS = {
  title: '待办',
  isFocused: true,
  bodyColumns: 80,
  placement: 'inline',
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
} as const

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

describe('hasExtractionCues 判断是否值得调模型提炼', () => {
  test('纯标题不触发（中文/英文/短数字）', () => {
    expect(hasExtractionCues('买牛奶')).toBe(false)
    expect(hasExtractionCues('buy milk')).toBe(false)
    expect(hasExtractionCues('review PR 1234')).toBe(false)
    expect(hasExtractionCues('')).toBe(false)
  })
  test('时间线索触发', () => {
    expect(hasExtractionCues('明天下午3点给妈妈买牛奶')).toBe(true)
    expect(hasExtractionCues('10-9 交报告')).toBe(true)
    expect(hasExtractionCues('周五前订机票')).toBe(true)
    expect(hasExtractionCues('晚上11点睡觉提醒')).toBe(true)
  })
  test('重要度/标签/逗号（可能带备注）触发', () => {
    expect(hasExtractionCues('买牛奶 重要')).toBe(true)
    expect(hasExtractionCues('买牛奶 #生活')).toBe(true)
    expect(hasExtractionCues('买牛奶，两盒')).toBe(true)
  })
  test('长文本（≥24 字符）视为含额外信息触发', () => {
    expect(hasExtractionCues('把上个季度沉淀的会议纪要整理成文档再发给相关同学')).toBe(true)
  })
})

describe('buildExtractMessages 提炼 prompt 构造', () => {
  test('system 说明字段与枚举，prompt 带原文与当前时间', () => {
    const now = new Date(2026, 9, 7, 10, 0)
    const { system, prompt } = buildExtractMessages('明天下午3点买牛奶', now)
    expect(system).toContain('urgent-important')
    expect(system).toContain('important')
    expect(system).toContain('general')
    expect(system).toContain('JSON')
    expect(prompt).toContain('明天下午3点买牛奶')
    expect(prompt).toContain('2026-10-7')
  })
})

describe('parseExtractReply 解析模型回复', () => {
  const now = new Date(2026, 9, 7, 10, 0)
  test('合法 JSON：全字段映射（due 为 M-D HH:mm）', () => {
    const r = parseExtractReply(
      '{"title":"买牛奶","notes":"给妈妈带","due":"10-9 15:00","tags":["生活","购物"],"importance":"urgent-important"}',
      '原始输入',
      now,
    )
    expect(r).toEqual({
      title: '买牛奶',
      notes: '给妈妈带',
      due: new Date(2026, 9, 9, 15, 0).toISOString(),
      tags: ['生活', '购物'],
      importance: 'urgent-important',
    })
  })
  test('JSON 包在散文/代码块里也能取出', () => {
    const r = parseExtractReply(
      '好的，提取结果：\n```json\n{"title":"交报告","due":"10-9"}\n```\n以上。',
      '原始输入',
      now,
    )
    expect(r?.title).toBe('交报告')
    expect(r?.due).toBe(new Date(2026, 9, 9, 20, 0).toISOString())
  })
  test('due 为 ISO 字符串时直接采用', () => {
    const r = parseExtractReply('{"title":"x","due":"2026-10-09T07:00:00.000Z"}', '原始输入', now)
    expect(r?.due).toBe('2026-10-09T07:00:00.000Z')
  })
  test('字段缺失/非法逐项回退：title→原文、importance→general、due→默认、notes→null', () => {
    const r = parseExtractReply('{"notes":"","due":"下周三","importance":"超紧急","tags":42}', '原始输入', now)
    expect(r).toEqual({
      title: '原始输入',
      notes: null,
      due: defaultDue(now),
      tags: [],
      importance: 'general',
    })
  })
  test('tags 清洗：去 #、去重、滤空/超长/非字符串、最多 5 个', () => {
    const r = parseExtractReply(
      '{"title":"x","tags":["#生活","生活","",42,"超————————————————————长的标签","a","b","c","d","e"]}',
      '原始输入',
      now,
    )
    expect(r?.tags).toEqual(['生活', 'a', 'b', 'c', 'd'])
  })
  test('没有 JSON / JSON 非对象 / JSON.parse 失败 → null', () => {
    expect(parseExtractReply('模型自由发挥没有结构', '原始输入', now)).toBe(null)
    expect(parseExtractReply('[1,2,3]', '原始输入', now)).toBe(null)
    expect(parseExtractReply('{"title":"x",}', '原始输入', now)).toBe(null)
  })
})

describe('extractFields 端到端（注入 complete）', () => {
  const now = new Date(2026, 9, 7, 10, 0)
  test('有线索时调用 complete 并解析回复', async () => {
    const calls: string[] = []
    const r = await extractFields(
      {
        complete: async prompt => {
          calls.push(prompt)
          return '{"title":"买牛奶","notes":null,"due":"10-8 15:00","tags":["生活"],"importance":"important"}'
        },
      },
      '明天下午3点买牛奶 #生活',
      now,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('明天下午3点买牛奶')
    expect(r).toEqual({
      title: '买牛奶',
      notes: null,
      due: new Date(2026, 9, 8, 15, 0).toISOString(),
      tags: ['生活'],
      importance: 'important',
    })
  })
  test('complete 失败（null）时返回 null，调用方降级', async () => {
    const r = await extractFields({ complete: async () => null }, '明天买牛奶', now)
    expect(r).toBe(null)
  })
  test('回复不可解析时返回 null', async () => {
    const r = await extractFields({ complete: async () => '抱歉我不明白' }, '明天买牛奶', now)
    expect(r).toBe(null)
  })
  test('纯标题不调 complete 直接返回 null', async () => {
    const calls: string[] = []
    const r = await extractFields(
      { complete: async () => (calls.push('x'), '{}') },
      '买牛奶',
      now,
    )
    expect(calls).toEqual([])
    expect(r).toBe(null)
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
        props: PANE_PROPS,
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
        props: PANE_PROPS,
      })

      expect(await ui.find({ text: '恢复的待办' })).toBeTruthy()
      expect(await ui.find({ key: 'open-restore-1' })).toBeTruthy()
    })
  }
})
