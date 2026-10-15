// Re-review: you reviewed it and it changed since, or you were asked again.
// Review: asked, not yet reviewed. Team: asked only through a team you are on.
// Waiting: your comments stand, nothing new.
export type Bucket = 'rereview' | 'review' | 'team' | 'waiting'

export type Item = {
  url: string
  repo: string
  number: number
  title: string
  author: string
  bucket: Bucket
  // Why it is in its bucket: 'new commits', 're-requested', 'requested', ...
  reason: string
  // When it entered that state (ms since the epoch): the push, the request, your review.
  since: number
  // The head commit your last review was on, when you reviewed it.
  reviewedCommit?: string
}

export type Queue = {
  items: Item[]
  // Left out as stale: no activity for longer than `staleDays`.
  stale: number
  fetchedAt: number
  error?: string
}

// The queue as every session reads it from the store: the session that asks
// GitHub (`owner`), and when it last asked, whether or not that worked.
export type Shared = Queue & { owner: string; checkedAt: number }

declare module 'claude-code' {
  interface PluginState {
    'review-queue': {
      queue: Shared | null
      // The PR the focus ring is on, in the pane or the dock.
      selected: string | null
      // PRs whose details are open in the pane.
      expanded: string[]
      // Groups the person folded or unfolded in the pane, against each one's default.
      toggled: string[]
    }
  }
}
