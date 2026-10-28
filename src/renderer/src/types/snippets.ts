export type SnippetScope = 'html' | 'markdown' | 'all'

export interface Snippet {
  id?: string
  prefix: string
  name: string
  description: string
  category: string
  scope: SnippetScope
  body: string[] | string
}

export interface SnippetsData {
  version: number
  trigger: string
  snippets: Snippet[]
}

export interface SnippetTabstop {
  index: number
  start: number
  end: number
  defaultValue: string
  choices?: string[]
}

export interface SnippetExpansion {
  text: string
  tabstops: SnippetTabstop[]
  tabstopIndices: number[]
}
