// Re-review: you reviewed it and it changed since, or you were asked again.
// Review: asked, not yet reviewed. Waiting: your comments stand, nothing new.
export type Bucket = 'rereview' | 'review' | 'waiting'

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

declare module 'claude-code' {
  interface PluginState {
    'review-queue': { queue: Queue | null }
  }
}
