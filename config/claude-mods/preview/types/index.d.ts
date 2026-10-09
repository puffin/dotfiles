export type Theme = 'dark' | 'light'
export type Doc = { path: string; text: string } | { path: string; error: string }

declare module 'claude-code' {
  interface PluginState {
    preview: { doc: Doc | null; theme: Theme }
  }
}
