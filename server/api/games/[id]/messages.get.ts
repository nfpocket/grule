import type { ChatMessageRow } from '#shared/types'

export default defineEventHandler((event): ChatMessageRow[] => {
  const id = getRouterParam(event, 'id')!
  const rows = getDb()
    .prepare('SELECT id, game_id, role, content, citations, created_at FROM chat_messages WHERE game_id = ? ORDER BY id')
    .all(id) as { id: number, game_id: string, role: 'user' | 'assistant', content: string, citations: string | null, created_at: number }[]
  return rows.map(r => ({
    id: r.id,
    gameId: r.game_id,
    role: r.role,
    content: r.content,
    citations: r.citations ? JSON.parse(r.citations) : null,
    createdAt: r.created_at
  }))
})
