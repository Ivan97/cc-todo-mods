import { describe, expect, test } from 'claude-code/testing'

import { defaultDue, formatDue, parseDueInput, sortTodos } from '../hooks/register'
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
