export type Importance = 'urgent-important' | 'important' | 'general'

export type Todo = {
  id: string
  title: string
  /** 备注，可空 */
  notes: string | null
  /** 截止时间，ISO 字符串 */
  due: string
  tags: string[]
  importance: Importance
  done: boolean
  createdAt: string
  doneAt: string | null
}

/** 表单编辑态（截止/标签为原始输入文本） */
export type TodoForm = {
  title: string
  notes: string
  due: string
  tags: string
  importance: Importance
}

export type TodoApplied = { id: string; title: string } | null

/** /todo 自然语言提炼结果（不进 $.state，仅在 command.run 内传递；due 已是合法 ISO，字段解析失败逐项回退默认值） */
export type ExtractedFields = {
  title: string
  notes: string | null
  due: string
  tags: string[]
  importance: Importance
}

declare module 'claude-code' {
  interface PluginState {
    todo: {
      todos: Todo[]
      view: 'list' | 'detail' | 'form'
      formMode: 'new' | 'edit'
      formTargetId: string | null
      form: TodoForm
      formError: string | null
      hideDone: boolean
      detailId: string | null
      /** 已应用到输入框、等待提交的待办 */
      applied: TodoApplied
      /** 提交后正在询问是否标记完成的待办 */
      ask: TodoApplied
      /** 本 session 是否已从 $.store 恢复过 todos */
      hydrated: boolean
    }
  }
}
