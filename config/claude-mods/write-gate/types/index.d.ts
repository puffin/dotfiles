// A write held for the user's approval: what it does, where, and its payload.
export type Pending = {
  tool: string
  action: string
  target: string
  // The text that will be posted (comment body, page content, command).
  body: string
  // The remaining arguments, as JSON, or extra context such as unpushed commits.
  meta: string
}

declare module 'claude-code' {
  interface PluginState {
    'write-gate': { pending: Pending | null }
  }
}
