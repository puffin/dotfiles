export type WatchKind = 'terrakube' | 'jenkins' | 'pr' | 'gha'
export type WatchStatus = 'queued' | 'running' | 'waiting' | 'passed' | 'failed'

export type Watch = {
  // Stable per run: a run started again under the same id replaces the old watch.
  id: string
  kind: WatchKind
  // What the run is, in a few words: workspace, job path, repo#PR, workflow.
  label: string
  // A second line once known: Terrakube template, PR or run title, branch.
  title?: string
  // terrakube: org and job ids, and the workspace id once the job is read
  org?: string
  job?: string
  ws?: string
  // jenkins: job path, build number (once known), queue item until it leaves the queue
  path?: string
  build?: string
  queueId?: string
  // pr: the PR's URL, checked from cwd
  pr?: string
  // gha: owner/name and the run id; a dispatched workflow's file until its run appears
  repo?: string
  run?: string
  workflow?: string
  cwd?: string
  // The project root of the session that started it, which the pane tags and `show` filters by.
  project?: string
  status: WatchStatus
  // The run's own word for where it is ("running", "#41 SUCCESS", "3/5 checks done").
  detail: string
  // Last lines of output, or failing check names, once there is something to show.
  tail: string[]
  url?: string
  // How far along, 0 to 1, where the service says (checks done, Jenkins estimate).
  progress?: number
  // Time left in ms, where the service estimates it (Jenkins).
  eta?: number
  startedAt: number
  checkedAt: number
  endedAt?: number
  // Queue a prompt for Claude when it finishes (watches Claude handed off).
  wake: boolean
  // The session that polls and announces it; another adopts it once it goes quiet.
  owner: string
  // The session that started it: the one whose Claude is woken, which takes it back when it can.
  origin: string
  // Until then a finished reading is the previous attempt's (a rerun, a push): it counts as starting.
  settleUntil?: number
  // Polls in a row that failed to reach the service, and why the last one did.
  misses: number
  error?: string
}

// The input of the mod's own tool, as the model calls it.
export type WatchRequest = {
  kind: WatchKind
  org?: string
  job?: string
  path?: string
  build?: string
  pr?: string
  run?: string
  repo?: string
}

declare module 'claude-code' {
  interface McpToolInputs {
    mcp__runwatch__watch: WatchRequest
  }
  interface PluginState {
    runwatch: {
      watches: Watch[]
      // Rows opened with Enter, by watch id.
      expanded: string[]
      // The row the pane's focus ring is on, which o, x and a act on.
      selected: string | null
    }
  }
}
