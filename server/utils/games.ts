import { rm } from 'node:fs/promises'
import type { Game, GameMeta } from '#shared/types'

interface GameRow {
  id: string
  title: string
  slug: string
  status: Game['status']
  stage: string | null
  progress: number
  error: string | null
  embedding_provider: string | null
  embedding_model: string | null
  embedding_dim: number | null
  chat_provider: string | null
  chat_model: string | null
  meta: string | null
  created_at: number
}

export function mapGame(row: GameRow): Game {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    stage: row.stage,
    progress: row.progress,
    error: row.error,
    embeddingProvider: row.embedding_provider,
    embeddingModel: row.embedding_model,
    embeddingDim: row.embedding_dim,
    chatProvider: row.chat_provider,
    chatModel: row.chat_model,
    meta: row.meta ? (JSON.parse(row.meta) as GameMeta) : null,
    createdAt: row.created_at
  }
}

export function getGame(id: string): Game | null {
  const row = getDb().prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined
  return row ? mapGame(row) : null
}

export function listGames(): Game[] {
  const rows = getDb().prepare('SELECT * FROM games ORDER BY created_at DESC').all() as GameRow[]
  return rows.map(mapGame)
}

export function updateGameProgress(
  id: string,
  patch: { stage?: string, progress?: number, status?: Game['status'], error?: string | null }
) {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []
  const set = (col: string, val: unknown) => {
    fields.push(`${col} = ?`)
    values.push(val)
  }
  if (patch.stage !== undefined) set('stage', patch.stage)
  if (patch.progress !== undefined) set('progress', patch.progress)
  if (patch.status !== undefined) set('status', patch.status)
  if (patch.error !== undefined) set('error', patch.error)
  if (!fields.length) return
  values.push(id)
  db.prepare(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export async function deleteGame(id: string) {
  const db = getDb()
  db.prepare('DELETE FROM games WHERE id = ?').run(id) // cascades to children
  await rm(gameDir(id), { recursive: true, force: true })
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'game'
}
