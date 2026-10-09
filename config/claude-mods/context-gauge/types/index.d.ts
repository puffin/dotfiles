export type Gauge = { tokens: number; percent: number }

declare module 'claude-code' {
  interface PluginState {
    'context-gauge': { gauge: Gauge | null; isHidden: boolean; line: string }
  }
}
