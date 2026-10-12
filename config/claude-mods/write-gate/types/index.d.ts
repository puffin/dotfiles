export type Row = [label: string, value: string]

// A write held for the user's approval: what it does, where, and its payload.
export type Pending = {
  tool: string
  // Short name for the log and the deny message: "Jira comment", "gh pr create".
  action: string
  // The dialog's question, also the pane's heading.
  question: string
  // The label of the option that sends it.
  approve: string
  target: string
  // Summary lines above the body: repo, branch, title.
  rows: Row[]
  // The text that will be posted (comment body, page content, PR description).
  body: string
  // The remaining arguments as JSON, or commits, under `metaLabel`.
  meta: string
  metaLabel: string
  // The shell command as Claude wrote it, '' for an MCP tool.
  command: string
}

declare module 'claude-code' {
  interface PluginState {
    'write-gate': { pending: Pending | null }
  }
}
