export type WatchKind = 'terrakube' | 'jenkins' | 'pr'
export type WatchStatus = 'queued' | 'running' | 'waiting' | 'passed' | 'failed'

export type Watch = {
  // Stable per run: a run started again under the same id replaces the old watch.
  id: string
  kind: WatchKind
  label: string
  // terrakube: org and job ids
  org?: string
  job?: string
  // jenkins: job path, build number (once known), queue item until it leaves the queue
  path?: string
  build?: string
  queueId?: string
  // pr: the PR's URL, checked from cwd
  pr?: string
  cwd?: string
  status: WatchStatus
  // The run's own word for where it is ("running", "#41 SUCCESS", "3/5 checks done").
  detail: string
  // Last lines of output, or failing check names, once there is something to show.
  tail: string[]
  url?: string
  startedAt: number
  checkedAt: number
  endedAt?: number
  // Queue a prompt for Claude when it finishes (watches Claude handed off).
  wake: boolean
  // Polls in a row that failed to reach the service.
  misses: number
}

// The input of the mod's own tool, as the model calls it.
export type WatchRequest = {
  kind: 'terrakube' | 'jenkins' | 'pr'
  org?: string
  job?: string
  path?: string
  build?: string
  pr?: string
}

declare module 'claude-code' {
  interface McpToolInputs {
    mcp__runwatch__watch: WatchRequest
  }
  interface PluginState {
    runwatch: { watches: Watch[] }
  }
}
