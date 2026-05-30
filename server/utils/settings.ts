import type { ProviderSettings } from '#shared/types'

const DEFAULTS: ProviderSettings = {
  chat: { provider: 'openai', model: 'gpt-4o-mini' },
  embedding: { provider: 'openai', model: 'text-embedding-3-small' }
}

export function getSettings(): ProviderSettings {
  const db = getDb()
  const row = db.prepare(`SELECT value FROM settings WHERE key = 'providers'`).get() as
    | { value: string }
    | undefined
  if (!row) return DEFAULTS
  try {
    const parsed = JSON.parse(row.value) as Partial<ProviderSettings>
    return {
      chat: { ...DEFAULTS.chat, ...parsed.chat },
      embedding: { ...DEFAULTS.embedding, ...parsed.embedding }
    }
  } catch {
    return DEFAULTS
  }
}

export function saveSettings(settings: ProviderSettings): ProviderSettings {
  const db = getDb()
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('providers', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(JSON.stringify(settings))
  return settings
}
